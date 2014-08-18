#!/usr/bin/env node

var util = require('util');
var logger = console;
var fs = require('fs');
var exec = require('child_process').exec;
var express = require('express');
var cors = require('cors');
var bodyParser = require('body-parser');
var request = require('request');
var prompt = require('prompt');
var pwuid = require('pwuid');
var uuid = require('node-uuid');
var WebSocket = require('ws');
var inquirer = require('inquirer');


var run = function() {

var keypress = require('keypress');
keypress(process.stdin);

var blessed = require('blessed')
  , program = blessed.program();

var bot = {};

var ui = null;

var menus = {
    'default': {
        items: [
            {
                shortcut: 'D',
                title: 'Documentation'
            },
            {
                shortcut: 'O',
                title: 'Options'
            },
            {
                shortcut: 'Q',
                title: 'Quit'
            }
        ]
    },
    'options': {
        items: [
            {
                shortcut: 'C',
                title: 'Configure this byte'
            },
            /*
            {
                shortcut: 'Shift-C',
                title: 'Generate configuration'
            }
            */
        ]
    }
};

var menuStack = [menus['default']];

var menuHandler = function (ch, key) {

    var currentMenu = menuStack[menuStack.length - 1];

    if (key && key.ctrl && key.name == 'c') {
        logger.info('\nExiting');
        process.exit(0);
    } else if (menuStack.length > 1 && key && !key.ctrl && key.name == 'escape') {
        menuStack.pop();
        renderMenu();
    }

    if (currentMenu == menus['default']) {
        if (key && !key.ctrl && key.name == 'q') {
            logger.info('\nExiting');
            process.exit(0);
        } else if (key && !key.ctrl && key.name == 'o') {
            menuStack.push(menus['options']);
            renderMenu();
        } else if (key && !key.ctrl && key.name == 'd') {
            var child = exec('open https://github.com/onehq/byte-api/blob/master/README.md', function (error, stdout, stderr) {});
        }
    } else if (currentMenu == menus['options']) {
        if (key && !key.shift && key.name == 'c') {
            var child = exec('open ' + bot.localURL + '/config#local', function (error, stdout, stderr) {});
        }
    }

    setTimeout(function () {
        process.stdout.write("\033[2K\033[1D");
    }, 0);
}

function renderMenu () {
    if (!ui) {
        process.stdin.on('keypress', menuHandler);

        process.stdin.setRawMode(true);
        process.stdin.resume();

        program.hideCursor();
        ui = new inquirer.ui.BottomBar();
    }

    // clone menu item so injected item isn't injected to original array every time
    var currentMenu = JSON.parse(JSON.stringify(menuStack[menuStack.length - 1]));

    if (menuStack.length > 1) {
        currentMenu.items.push({
            shortcut: 'ESC',
            title: 'Back'
        });
    }

    var items = [];

    for (var i = 0; i < currentMenu.items.length; i++) {
        var item = currentMenu.items[i];
        items.push('('.white + item['shortcut'].green + ')'.white + ' ' + item['title'].green.bold);
    };

    ui.updateBottomBar('\n' + items.join('  ') + '\n');
}

function log (message) {
    ui ? ui.log.write(message) : logger.info(message);
}

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

    bot.localURL = localURL;

    // set up bytebot-local
    bot.client = new WebSocket('ws://trackers.one.co:9979');

    // open connection
    bot.client.on('open', function () {
        var sessionID = uuid.v4();
        log('Established connection to bytebot-remote; sending session information');
        log('Session ID: ' + sessionID)
        bot.client.sendEvent('authorize', {
            'path': localURL,
            'accessToken': accessToken,
            'sessionID': sessionID
        });
    });

    bot.client.onEvent('authorizationComplete', function (data) {
        log('Session started; open app to see your local tracker');
        renderMenu();
    });

    bot.client.onEvent('configUpdated', function (data) {
        log('Configuration was updated by bytebot-remote ->');
        log('\t' + util.inspect(data));
    });

    // when bytebot-remote asks for update from local tracker
    bot.client.onEvent('getResponse', function (data) {
        log('Requesting update from local tracker ->');
        log('\tPath: ' + data.path);
        log('\tHeaders: ' + util.inspect(data.headers));
        log('\tBody:' + data.body);

        request.post({
            url: data.path,
            headers: data.headers,
            json: data.body
        }, function (error, response, body) {
            if (error) {
                // TODO
            } else {
                log('Received update; sending to bytebot-remote');
                bot.client.sendEvent('receivedResponse', {
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
        log('Too many tries; exiting');
        process.exit();
    } else if (tries > 0) {
        log('Invalid authorization information; try again\n');
    }

    try {
        var lastSession = fs.readFileSync(pwuid().dir + '/BytebotSession', {encoding: 'utf8'});
        lastSession = JSON.parse(lastSession);
    } catch (e) {

    }

    var mobilePrompt = {
        properties: {
            mobile: {
                description: 'Mobile #:'.green
            }
        }
    };

    var codePrompt = {
        properties: {
            code: {
                description: 'Code:'.green
            }
        }
    };

    function connectWithAccessToken (accessToken) {
        log('Authorized; saving session information');

        var urlPrompt = {
            properties: {
                localURL: {
                    description: 'Local URL:'.green
                }
            }
        };

        if (lastSession && lastSession.localURL) {
            var urlString = 'Local URL (' + lastSession.localURL + '):';
            urlPrompt.properties.localURL.description = urlString.green;
        }

        prompt.get(urlPrompt, function (error, results) {
            if (!results.localURL) {
                results.localURL = lastSession.localURL;
            }

            log('Pointing bytebot-local to ' + results.localURL);
            fs.writeFileSync(pwuid().dir + '/BytebotSession', JSON.stringify({'accessToken': accessToken, 'localURL': results.localURL}, undefined, 2));
            start(accessToken, results.localURL);

            var server = express();
            server.use(cors());
            server.use(bodyParser.json());
            server.use(bodyParser.urlencoded({
              extended: 'true'
            }));
            server.post('/__config', function (req, res) {
                log('Received request for configuration update; sending to bytebot-remote');
                bot.client.sendEvent('setConfiguration', req.body);
                res.send('Received');
            });
            server.listen(7001);
        });
    }

    function promptForCode (mobileNumber) {
        console.log("Enter your six digit verification code");
        prompt.get(codePrompt, function (error, results) {
            var code = results.code;
            request.post({
                url: 'https://api.one.co/api/confirm',
                form: {
                    mobile: mobileNumber,
                    code: code,
                    client_id: 'OM62PLTPTXTCPSYH2YCZ6FN2OI7MFM3S',
                    client_secret: '2F75CDWHZKS4FPHUT3HRO6GMJ57UD43O'
                }
            }, function (error, response, body) {
                if (body) {
                    body = JSON.parse(body);
                }
                if (!error && body.data) {
                    connectWithAccessToken(body.data.access_token);
                } else if (body.error) {
                    console.log(body.error.message + "\n");
                    tryAuthorizing(tries + 1);
                }else {
                    log('An unexpected error occurred; exiting');
                }
            });
        });
    }

    if (!lastSession || !lastSession.accessToken) {678
        console.log("Enter your mobile number; we'll send a text to verify you");
        prompt.get(mobilePrompt, function (error, results) {
            var mobileNumber = results.mobile;
            request.post({
                url: 'https://api.one.co/api/login',
                form: {
                    mobile: mobileNumber,
                },
                auth: {
                    user: 'ATWDMBB6W5YZIXS7SZQJNGDQ2FCCLJRR',
                    pass: 'LWNMO23D5QDZJCTQYNDLYMSL2BN7H7XJ'
                }
            }, function (error, response, body) {
                if (body) {
                    body = JSON.parse(body);
                }
                if (!error && body.data) {
                    promptForCode(mobileNumber);
                } else if (body.error) {
                    console.log(body.error.message + "\n");
                    tryAuthorizing(tries + 1);
                }else {
                    log('An unexpected error occurred; exiting');
                }
            });
        });
    } else {
        log('Connecting with saved access token');
        connectWithAccessToken(lastSession.accessToken);
    }
}

tryAuthorizing();

}

module.exports = {
    run: run
}