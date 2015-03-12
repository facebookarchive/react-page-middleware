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
  ROOT_MODULE_NAME: 'root.js',

  // Captures the set of tags and extension in parens ()
  ALL_TAGS_AND_EXT_RE: /\.([^\/]+)$/,


  // URL bundle-routing scheme:
  // localhost:8080/path/to/Root.x.y.z.a.b.c.d.e.f.g.bundle
  //                             \----- tags ------/ \type/
  // Route types:

  BUNDLE_EXT: '.bundle',
  BUNDLE_EXT_RE: /\.bundle$/,

  MAP_EXT: '.map',
  MAP_EXT_RE: /\.map$/,

  // Route tags:
  INCLUDE_REQUIRE_TAG: 'includeRequire',
  RUN_MODULE_TAG: 'runModule',

  // Misc:
  JS_SRC_EXT: '.js',
  JS_SRC_EXT_RE: /\.js[^\/]*$/
};
