

var pear = require('./lib/pear');
var express = require('express');
// var redis = require('redis');



// var db = redis.createClient();
var app = express();



app.get('/hello', function(req, res){
    console.log('app got it. hello world!')
    res.send('Hello World');
});





pear.createChildrenServers(app).listen([
    'tcp://127.0.0.1:9001',
    'tcp://127.0.0.1:9002',
    'tcp://127.0.0.1:9003',
    'tcp://127.0.0.1:9004'
]);

var parent = pear.createParentServer([
    'tcp://127.0.0.1:9001',
    'tcp://127.0.0.1:9002',
    'tcp://127.0.0.1:9003',
    'tcp://127.0.0.1:9004',
]);
parent.listen(9000);
