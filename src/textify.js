/**
 * Copyright 2013 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
"use strict";



var modularizeTextFile = require('./modularizeTextFile');

var supportedExtensionsRegexes =
  modularizeTextFile.supportedExtensions.map(function(extension) {
    return new RegExp('^.+\\' + extension + '$');
  });

var through = require('through');

var jsModuleCode;
var e;
module.exports = function(file) {
  var data = '';
  var write = function(chunk) {
    return data += chunk;
  };
  var compile = function() {
    var isTextExtension = false;
    for (var i = 0; i < supportedExtensionsRegexes.length; i++) {
      var re = supportedExtensionsRegexes[i];
      if (re.exec(file)) {
        isTextExtension = true;
        break;
      }
    }
    if (isTextExtension) {
      try {
        jsModuleCode = modularizeTextFile(data);
      } catch (_error) {
        e = _error;
        this.emit('error', e);
      }
      this.queue(jsModuleCode);
    } else {
      this.queue(data);
    }
    return this.queue(null);
  };
  return through(write, compile);
};

