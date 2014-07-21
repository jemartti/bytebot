#!/usr/bin/env node

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

function start (accessToken, localURL) {

	// set up bytebot-local
	var client = new WebSocket('ws://trackers.one.co:9979');

	// open connection
	client.on('open', function () {
		var sessionID = uuid.v4();
	    logger.info('Established connection to bytebot-remote, sending session information');
	    logger.info('Session ID: ' + sessionID)
	    client.sendEvent('authorize', {
	    	'path': localURL,
	        'accessToken': sessionID
	    });
	});

	client.onEvent('authorizationComplete', function (data) {
		logger.info('Session started; building dummy subscription');
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
\n".white);

function tryAuthorizing (tries) {
	tries = tries || 0;
	if (tries >= 3) {
		logger.info('Too many tries; exiting');
		process.exit();
	} else if (tries > 0) {
		logger.info('Invalid authorization information; try again\n');
	}

	try {
		var lastSession = fs.readFileSync(pwuid().dir + '/BytebotSession', {encoding: 'utf8'});
		lastSession = JSON.parse(lastSession);
	} catch (e) {

	}

	var authPrompt = {
		properties: {
			username: {
				description: 'Username:'.green
			},
			password: {
				hidden: true,
				description: 'Password:'.green
			}
		}
	};

	function connectWithAccessToken (accessToken) {
		logger.info('Authorized; saving session information');

		var urlPrompt = {
			properties: {
				localURL: {
					description: 'Local URL:'.green
				}
			}
		};

		if (lastSession && lastSession.localURL) {
			var urlString = 'Local URL (default: ' + lastSession.localURL + ')';
			urlPrompt.properties.localURL.description = urlString.green;
		}

		prompt.get(urlPrompt, function (error, results) {
			if (!results.localURL) {
				results.localURL = lastSession.localURL;
			}

			logger.info('Pointing bytebot-local to ' + results.localURL);
			fs.writeFileSync(pwuid().dir + '/BytebotSession', JSON.stringify({'accessToken': accessToken, 'localURL': results.localURL}, undefined, 2));
			start(accessToken, results.localURL);
		});
	}

	if (!lastSession || !lastSession.accessToken) {
		prompt.get(authPrompt, function (error, results) {
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
					connectWithAccessToken(body.access_token);
				} else if (!error) {
					tryAuthorizing(tries + 1);
				} else {
					logger.info('An unexpected error occurred; exiting');
				}
			});
		});
	} else {
		logger.info('Connecting with saved access token');
		connectWithAccessToken(lastSession.accessToken);
	}
}

tryAuthorizing();
