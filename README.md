Garnet
======

Garnet is a fast and minimalist template engine for [Node](http://nodejs.org/).

Installation
------------

    $ npm install garnet

Features
--------

- Compatible with [Express](http://expressjs.com/)
- Compiled templates are cached in memory
- Evaluate JavaScript (e.g., for conditionals and loops): `% code %`
- Evaluate and embed (with sanitization): `%= code %`
- Evaluate and embed (without sanitization): `%- code %`
- A flexible inclusion mechanism for partials, layouts, etc.

API
---

The main function is:

    garnet.render(path, locals, callback)

`path` is the path to the template file (if no file extension present, `.garnet` is assumed). `locals` is an object that is made available to the template. `callback(err, output)` is called with the result.

Examples
--------

### Using Garnet with Express

By default, you should put your views in `./views` and give them a `.garnet` extension. If you follow these conventions, there is no configuration needed.

To render a view, follow the usual Express syntax:

    res.render('index.garnet');

If you want to omit the `.garnet` extension from the line above, you can tell Express to assume it:

    app.set('view engine', 'garnet');

If you want to use a different file extension for views, use this:

    app.engine('html', garnet.render);
    garnet.templateExt = '.html';

If you want to change the default path for unqualified file names (default is `./views`):

    garnet.templateDir = path.join(process.cwd(), 'templates');

### Locals

You can pass data to a view using the `locals` argument.

For example, in `server.js`:

    res.render('user.garnet', { name: 'Stephan Boyer' });

In `views/user.garnet`:

    Name: %= locals.name %

### Conditionals

    % if (user) { %
      Name: %= user.name %
    % } %

### Loops

    % for (var i = 0; i < 10; i++) { %
      Number: %= i %
    % } %

### Includes

To use includes, you must tell the compiler in advance which views you might include. In most cases, you can declare it right in the parent view like this: `%@ path %`. Then you can include it with `%- render(path, locals) %`. Example:

    <!-- Tell the compiler to load 'user.garmet' in advance. -->
    <!-- Note: This is required. -->
    %@ user.garnet %

    <p>Here is some information about the user:</p>

    <!-- Include the view here. -->
    %- render('user.garnet', { user: someUser }) %

Sometimes, you don't always know in advance the name of the view you want to include.  For example, suppose you want to implement a layout, passing the name of the view as a local:

    <!DOCTYPE html>
    <html>
      <head>
        <title>Layout Demo</title>
      </head>
      <body>
        %- render(locals.view) %
      </body>
    </html>

We can't declare `locals.view` as a dependency using the `%@ ... %` syntax because it is not known statically. We still need to tell Garnet to load this file from disk in advance (so that the call to `render` can work synchronously). To do this, we must call `garnet.require(path)` before rendering the view. In Express, that might look like this:

    app.get('/', function(req, res) {
      // This is not necessarily known statically
      pathToView = 'index.garnet';

      // Tell the compiler to load the view from disk and cache it
      garnet.require(pathToView);

      // Now we can render the layout (which includes the view dynamically)
      res.render('layout.garnet', { view: pathToView });
    });

### Disable caching

If you want Garnet to reload and recompile templates whenever they are rendered, you can do so with:

    garnet.enableCaching = false;

This is useful for development (you don't need to restart the server for every change), but it is strongly recommended that you leave caching enabled in production.
