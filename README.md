Garnet
======

Garnet is a fast and minimalist template engine for [Node](http://nodejs.org/).

Installation
------------

    $ npm install garnet

Features
--------

- Compatible with [Express](http://expressjs.com/)
- Performant due to precompilation and caching
- Evaluate JavaScript (e.g., for conditionals and loops): `<% code %>`
- Evaluate and embed (with sanitization): `<%= code %>`
- Evaluate and embed (without sanitization): `<%- code %>`
- Render a template from within a template: `<%- render(path, locals) %>`

API
---

### Compiling and rendering

To compile a template (or fetch an already-compiled template from cache):

    var template = garnet.compile(path);

To render a template:

    var output = template(locals);

To render a template from within another template (and compile it if necessary):

    <%- render(path, locals) %>

### Default template directory

By default, Garnet looks in `./views` for unqualified template names. If you want to change the default path to `./templates`, for example, use:

    garnet.templateDir = path.join(process.cwd(), 'templates');

### Default template extension

If you refer to a view without a file extension, Garnet assumes `.garnet` by default. You can change this like so:

    garnet.templateExt = '.html';

### Caching

By default, Garnet will only load and compile a template once. If you want Garnet to reload and recompile templates whenever they are rendered, you can do so with:

    garnet.enableCaching = false;

This is useful for development (you don't need to restart the server for every change), but you should leave caching enabled in production.

Examples
--------

### Using Garnet with Express

To render a view with Express:

    app.get('/', function(req, res) {
      res.render('index.garnet');
    }

If you want to omit the `.garnet` extension from the line above, you can tell Express to assume it:

    app.set('view engine', 'garnet');

If you want to use a different file extension (e.g., `.html`) for views, use this:

    app.set('view engine', 'html');       // Tell Express to assume this extension
    app.engine('html', garnet.__express); // Tell express to use Garnet for this extension
    garnet.templateExt = '.html';         // Tell Garnet to assume this extension

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

    <% users.forEach(function(user) { %>
      Name: <%= user.name %>
    <% } %>

### Layouts

We simply pass the name of the view to the layout as a local:

    <!DOCTYPE html>
    <html>
      <head>
        <title>Layout Demo</title>
      </head>
      <body>
        <%- render(locals.view, locals) %>
      </body>
    </html>

In Express, you might render a view with this layout as follows:

    app.get('/', function(req, res) {
      res.render('layout.garnet', { view: 'index.garnet' });
    });
