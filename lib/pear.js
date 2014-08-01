
var zmq = require('zmq');
var http = require('http');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var msgpack = require('msgpack');



function ParentServer(childAddresses) {
    if (!(this instanceof ParentServer)) return new ParentServer(childAddresses);

    var self = this;

    // connect
    this.childAddresses = childAddresses || [];
    this.childSockets = [];

    function boundReply(address) {
        return function (err){
            if (err) {
                console.log('connection err', err);
            } else {
                console.log('connected to child', address)
            }
        };
    }

    for (var i in this.childAddresses) {
        var sock = zmq.socket('req');
        var socket = sock.bind(this.childAddresses[i], boundReply(this.childAddresses[i]));
        this.childSockets.push(socket);
    }

}
util.inherits(ParentServer, EventEmitter);
ParentServer.prototype.receiveData = function(msg) {
};
ParentServer.prototype.listen = function(port) {
    var self = this;

    function httpListener(req, res) {
        console.log('incoming HTTP', req.method, req.headers.host, req.url, req.headers['user-agent']);
        var reqSocket = relayData(req);

        // TODO: manage the response!
        reqSocket.on('message', function (msg) {
            var res = msgpack.unpack(msg);
            console.log('server received res', res);
        })
    }
    this.server = http.createServer(httpListener).listen(port, function() {
        console.log('listening on port ' + port);
    });

    var rrKey = -1;
    function roundRobinSocket() {
        rrKey++;
        if (rrKey >= self.childSockets.length) {
            rrKey = 0;
        }
        console.log('RR pick', rrKey);
        return self.childSockets[rrKey];
    }
    function simplifyRequest(req) {
        // var out = {};
        // for (var i in req) {
        //     out[i] = req[i];
        // }
        // return out;
        return {
            complete: req.complete,
            headers: req.headers,
            httpVersion: req.httpVersion,
            method: req.method,
            // statusCode: req.statusCode,
            trailers: req.trailers,
            upgrade: req.upgrade,
            url: req.url,
        };
    }
    function relayData(req) {
        var socket = roundRobinSocket();

        if (req.method == 'POST' || req.method == 'PUT' || req.method == 'PATCH'){
            var body = '';
            req.on('data', function (chunk) {
                body += chunk;
                // TODO we should probably just stream this
            });
            req.on('end', function () {
                var simpleReq = simplifyRequest(req);
                simpleReq.post = body;
                var b = msgpack.pack(simpleReq);
                console.log('parent send POST req', simpleReq);
                socket.send(b);
            });
        } else {
            var simpleReq = simplifyRequest(req);
            var b = msgpack.pack(simpleReq);
            console.log('parent send req', req);
            // console.log('parent send req', simpleReq);
            socket.send(b);
        }
        return socket;
    }


    rawBody = '';
    this.server.on('connect', function() {
        rawBody = '';
    });
    this.server.on('data', function(chunk) {
        rawBody += chunk;
    });
    this.server.on('end', function() {
        relayData(rawBody);
    });

    return this.server;
};
ParentServer.prototype.close = function() {
    for (var i in this.childSockets) {
        this.childSockets[i].close();
    }
};
exports.ParentServer = ParentServer;




function ChildServer(requestListener, id) {
    if (!(this instanceof ChildServer)) return new ChildServer(requestListener, id);
    EventEmitter.call(this);

    if (requestListener) {
        this.addListener('request', requestListener);
    }

    this.requestListener = requestListener;
    this.id = id;
    // console.log(this)
}
util.inherits(ChildServer, EventEmitter);
ChildServer.prototype.listen = function(address) {
    this.address = address;

    var sock = zmq.socket('rep');
    sock.connect(address);

    function receiveData(msg) {
        var req = msgpack.unpack(msg);
        // TODO: turn this back into a real request object PARSEME
        // TODO: this should actually be a request stream instead?
        console.log('child req', req)

        var res = {};
        res.write = function write(msg) {
            console.log('child res write', msg);
            var b = msgpack.pack(simplifyRequest(msg));
            sock.send(b, zmq.ZMQ_SNDMORE);
        };
        res.end = function end(msg) {
            console.log('child res end', msg);
            var b = msgpack.pack(simplifyRequest(msg));
            sock.send(b);
        };

        // this.emit('request', [req, res]);
        this.emit('request', req);
        // this.requestListener(req);
    }
    sock.on('message', receiveData.bind(this));
    console.log('child', this.id, 'serving at', address)

    this.socket = sock;
};
exports.ChildServer = ChildServer;



function MultiChildServer(requestListener) {
    this.requestListener = requestListener;
}
MultiChildServer.prototype.listen = function(addresses) {
    this.childServers = [];
    for (var i in addresses) {
        var server = new ChildServer(this.requestListener, i);
        // console.log(server)
        server.listen(addresses[i]);
        this.childServers.push(server);
    }
    return this.childServers;
};



exports.createParentServer = function (childAddresses) {
    return new ParentServer(childAddresses);
};

exports.createChildServer = function (requestListener) {
    return new ChildServer(requestListener);
};
exports.createChildrenServers = function (requestListener) {
    return new MultiChildServer(requestListener);
};

