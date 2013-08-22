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

module.exports = {
  LEADING_SLASH_RE: /^\//,
  INDEX_JS_SUFFIX_RE: /\/index\.js[^\/]*$/,
  PACKAGE_EXT: '.bundle',
  HAS_EXT_RE: /\.[^\/]*$/,
  PACKAGE_EXT_RE: /\.bundle[^\/]*$/,
  PAGE_SRC_EXT: '.js',
  PAGE_SRC_EXT_RE: /\.js[^\/]*$/,
  PAGE_EXT_RE: /\.html[^\/]*$/
};
