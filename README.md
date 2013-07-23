react-page-middleware
===============================================
Build entire pages using React, JSX, and CommonJS.

  - Generate full pages using JavaScript rendering with React.
  - Renders pages on the server, brings them to life on the client.
  - "Just works" on both client and server - no special glue to write.
  - Simply list `react-page-middleware` as an npm dependency in your project.

<br>

###Install

> Create a directory with your project structure:

     yourProject/
      ├── package.json              # Add npm dependencies here.
      ├── server.js                 # Add npm dependencies here.
      └── src/
          └── index.jsx             # Requests to index.html routed here.

> List your dependencies in `package.json`:

    "dependencies": {
      "react-core": "git://github.com/jordwalke/npm-react-core.git",
      "react-page-middleware": "0.2.0",
      "connect": "2.8.3"
    },

    cd yourProject
    npm install

> Download your project's dependencies:

    cd yourProject
    npm install


> Create a `server.js` file or integrate with your existing connect server:

    var reactPageMiddleware = require('react-page-middleware');
    var connect = require('connect');
    var http = require('http');

    var app = connect()
      .use(reactPageMiddleware.provide({sourceDir: __dirname + '/src', dev: true}))
      .use(connect['static'](__dirname + '/src'));


> Run the server and open index.html:


   node server
   open http://localhost:8080/index.html




### Run and Build on the Fly

>  Just hit your browser's refresh button to run an always-up-to-date version of your app.

- Dynamically packages/compiles your app on each server request.


Stay tuned for example app that has all of this setup done for you.
`react-page-middleware` is primarily just the underlying library for composing
React-server-rendered pages.
