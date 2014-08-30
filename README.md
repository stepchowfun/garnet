Garnet
======

Garnet is a fast and minimalist template engine for [Node](http://nodejs.org/).

Installation
------------

    $ npm install garnet

Features
--------

- Compatible with [Express](http://expressjs.com/)
- Performant due to caching and precompilation
- Never performs synchronous I/O
- Evaluate JavaScript (e.g., for conditionals and loops): `<% code %>`
- Evaluate and embed (with sanitization): `<%= code %>`
- Evaluate and embed (without sanitization): `<%- code %>`
- A flexible inclusion mechanism for partials, layouts, etc.

API
---

### Rendering

The only function is:

    garnet.render(path, locals, callback)

`path` is the path to the template file. `locals` is an object that is made available to the template. `callback(err, output)` is called with the result.

### Default template directory

By default, Garnet looks in `./views` for unqualified template names. If you want to change the default path to `./templates`, use:

    garnet.templateDir = path.join(process.cwd(), 'templates');

### Default template extension

If you refer to a view without a file extension, Garnet assumes `.garnet` by default. You can change this like so:

    garnet.templateExt = '.html';

### Caching

If you want Garnet to reload and recompile templates whenever they are rendered, you can do so with:

    garnet.enableCaching = false;

This is useful for development (you don't need to restart the server for every change), but it is strongly recommended that you leave caching enabled in production.

Examples
--------

### Using Garnet with Express

By default, you should put your views in `./views` and give them a `.garnet` extension. If you follow these conventions, there is no configuration needed.

To render a view, follow the usual Express syntax:

    res.render('index.garnet');

If you want to omit the `.garnet` extension from the line above, you can tell Express to assume it:

    app.set('view engine', 'garnet');

If you want to use a different file extension (e.g., `.html`) for views, use this:

    app.set('view engine', 'html');    // Tell Express to assume this extension
    app.engine('html', garnet.render); // Tell express to use Garnet for this extension
    garnet.templateExt = '.html';      // Tell Garnet to assume this extension

### Locals

You can pass data to a view using the `locals` argument.

For example, in `app.js`:

    res.render('user.garnet', { name: 'Stephan Boyer' });

In `views/user.garnet`:

    Name: <%= locals.name %>

### Conditionals

    <% if (user) { %>
      Name: <%= user.name %>
    <% } %>

### Loops

    <% for (var i = 0; i < 10; i++) { %>
      Number: <%= i %>
    <% } %>

### Includes

Because Garnet does never does synchronous I/O, it cannot read from disk while rendering a view. In order to include a view inside another view, you must first make sure Garnet has a copy of it in memory.

In most cases, you can declare view dependencies right in the parent view like this: `<%@ path %>`. Before rendering a view, Garnet will recursively scan the view for such dependencies and load them into memory. Then you can render nested views with `<%- render(path, locals) %>`. Example:

    <!-- Tell the preprocessor to load 'user.garmet' in advance -->
    <%@ user.garnet %>

    <p>Here is some information about the user:</p>

    <!-- Include the view here -->
    <%- render('user.garnet', { user: someUser }) %>

Sometimes, you don't always know in advance the name of the view you want to include.  For example, suppose you want to implement a layout, passing the name of the view as a local:

    <!DOCTYPE html>
    <html>
      <head>
        <title>Layout Demo</title>
      </head>
      <body>
        <%- render(locals.view) %>
      </body>
    </html>

We can't declare `locals.view` as a dependency using the `<%@ ... %>` syntax because it is not known in advance (the preprocessor does not evaluate JavaScript). We still need to tell Garnet to load this file from disk before rendering. To do this, we call `garnet.require(path)`. In Express, that might look like this:

    app.get('/', function(req, res) {
      // We can change this path to render different views with the same layout
      path = 'index.garnet';

      // Tell the compiler to load the view from disk and cache it
      garnet.require(path);

      // Now we can render the layout (which includes the view dynamically)
      res.render('layout.garnet', { view: path });
    });
