#!/usr/bin/env node

var util = require('util');

var argv = require('minimist')(process.argv.slice(2));
var command = argv._[0];
var availableCommands = ['serve', 'generate']

if (availableCommands.indexOf(command) < 0) {
  console.log("useage: bytebot <command> [options]\n\nAvailable commands:\n\nserve:     serve a Byte to your phone without deploying it\ngenerate:  generate a new Byte");
  return -1;
}

if (command == 'serve') {
  var server = require('./server/serve');
  server.run();
} else if (command == 'generate') {
  if (argv._.length < 2) {
    console.log("useage: bytebot generate YourByteName");
    return -1;
  }
  var targetName = argv._[1];
  var generator = require('./generator/generate');
  generator.create(targetName);
}
