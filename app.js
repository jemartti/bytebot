var logger = console;
var fs = require('fs');
var express = require('express');
var request = require('request');
var prompt = require('prompt');
var pwuid = require('pwuid');
var uuid = require('node-uuid');
var WebSocket = require('ws');

WebSocket.prototype.sendEvent = function (name, data) {
    function makeEvent (name, data) {
        data = data || null;
        return JSON.stringify({name: name, data: data});
    }

    this.send(makeEvent(name, data));
};

WebSocket.prototype.onEvent = function (name, handler) {
    if (this.handlers == null || this.handlers == undefined) {
        this.handlers = [];


        this.on('message', function (message) {
            var data = JSON.parse(message);
            
            if (this.handlers[data.name]) {
                this.handlers[data.name](data.data);
            }
        });
    }

    this.handlers[name] = handler;
};

function start (accessToken) {

	// set up bytebot-local
	var client = new WebSocket('ws://localhost:9979');

	// open connection
	client.on('open', function () {
	    logger.info('Established connection to bytebot-remote, sending authorization');
	    client.sendEvent('authorize', {
	    	'path': 'http://localhost:5000/stock',
	        'accessToken': uuid.v4()
	    });
	});

	client.onEvent('authorizationComplete', function (data) {
		logger.info('Authorized; building dummy subscription');
	});

	// when bytebot-remote asks for update from local tracker
	client.onEvent('getResponse', function (data) {
	    logger.info('Requesting update from local tracker ->');
	    logger.info('\tPath:', data.path);
	    logger.info('\tHeaders:', data.headers);
	    logger.info('\tBody:', data.body);

	    request.post({
	        url: data.path,
	        headers: data.headers,
	        body: data.body
	    }, function (error, response, body) {
	        if (error) {
	            // TODO
	        } else {
	        	logger.info('Received update, sending to bytebot-remote');
	            client.sendEvent('receivedResponse', {
	                'headers': response.headers,
	                'body': body
	            });
	        }
	    });
	});

}

prompt.message = '';
prompt.delimiter = '';
prompt.start();

console.log("\n\
  ___      _       _         _   \n\
 | _ )_  _| |_ ___| |__  ___| |_ \n\
 | _ \\ || |  _/ -_) '_ \\/ _ \\  _|\n\
 |___/\\_, |\\__\\___|_.__/\\___/\\__|\n\
      |__/                       \
\n".bold.yellow);

function tryAuthorizing (tries) {
	tries = tries || 0;
	if (tries >= 3) {
		logger.info('Too many tries; exiting');
		process.exit();
	} else if (tries > 0) {
		logger.info('Invalid authorization information; try again\n');
	}

	prompt.get({
		properties: {
			username: {
				description: 'Username:'.green
			},
			password: {
				description: 'Password:'.green
			}
		}
	}, function (error, results) {
		request.post({
			url: 'http://api.one.co:8080/api/token',
			form: {
				grant_type: 'password',
				username: results.username,
				password: results.password
			},
			auth: {
				user: 'ATWDMBB6W5YZIXS7SZQJNGDQ2FCCLJRR',
				pass: 'LWNMO23D5QDZJCTQYNDLYMSL2BN7H7XJ'
			}
		}, function (error, response, body) {
			if (body) {
				body = JSON.parse(body);
			}

			if (!error && body.access_token) {
				logger.info('Authorized; saving session information');
				fs.writeFileSync(pwuid().dir + '/BytebotSession', JSON.stringify({'accessToken': body.access_token}, undefined, 2));
				start(body.access_token);
			} else if (!error) {
				tryAuthorizing(tries + 1);
			} else {
				logger.info('An unexpected error occurred; exiting');
			}
		});
	});
}

tryAuthorizing();
