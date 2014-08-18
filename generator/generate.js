#!/usr/bin/env node

var util = require('util');
var logger = console;
var fs = require('fs');
var exec = require('child_process').exec;


var create = function(targetName) {

  if (fs.existsSync('./' + targetName)) {
    console.log("Error: " + targetName + " already exists, not overwriting.");
    return -1;
  }

  var child = exec('cp -r ' + __dirname + '/templates/simple  ./' + targetName,
    function (error, stdout, stderr) {
      if (error !== null) {
        console.log('error generating Byte: ' + error);
      }else{
        console.log("Generated " + targetName + "\nNext run: cd " + targetName + " && npm update && node index.js");
      }
    });

}

module.exports = {
    create: create
}
