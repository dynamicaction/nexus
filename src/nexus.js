//This is our main server where we will define our skeleton routes
const express = require('express');
const app = express();
const port = 3000;

var path = require('path');

//This lets us serve static files through the /static route
app.use('/static', express.static(path.join(__dirname, 'static')));

//This is our main web page. We server it statically
app.get('/nexus', function(req, res) {
  res.sendFile( __dirname + '/static/sankey.html'); //Since we have configured to use public folder for serving static files. We don't need to append public to the html file path.
});

//This request returns the JSON necessary to build a feed sankey diagram
app.get('/sankey/:feedid', require('./helpers/sankey.js'));

//This request returns the JSON of our feedOutputs.yaml files
app.get('/sankey/data/getFeeds', require('./helpers/getFeeds.js'));

//This starts up our app and listens
app.listen(port, () => console.log(`Example app listening on port ${port}!`))

//Custom Error Handler
app.use(function(err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }

  if (err.status >= 100 && err.status < 600)
    res.status(err.status);
  else
    res.status(400);

  res.json({
    status: err.status,
    error: err.message,
    stack: err.stack})
});