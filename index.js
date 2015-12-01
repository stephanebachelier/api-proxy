var koa = require('koa');
var path = require('path');
var Promise = require('bluebird');
var fs = require('mz/fs');
var agent = require('superagent').agent();
var defaults = require('lodash/object/defaults');

var logResource = require('debug')('resource');
var logError = require('debug')('error');

app = koa();
var router = require('koa-router')();

var host = process.env.HOST || 'http://localhost:5000/api';
var baseDir = path.join(__dirname, 'public');
var root = '/api';
var rootPattern = new RegExp(root);

const cors = require('koa-cors');
app.use(cors({
    origin: true
}));

var json = require('koa-json');
app.use(json());

app.use(function* (next) {
  try {
    yield* next;
  }
  catch (err) {
    this.status = 500;
    this.body = err.message;
  }
});

function* send(path) {
  function done() {
    console.log('done');
  }
  return fs.createReadStream(path)
      .on('error', done)
      .on('finish', done);
}


function* through(resource) {
  return new Promise(function (resolve, reject) {
    agent.get(host + resource)
      .buffer(true)
      .set('Accept', 'application/json')
      .end(function (err, resp) {
        logError(err);
        if (err) {
          return reject({
            status: 500,
            body: resp.error
          });
        }
        resolve({
          status: 200,
          body: resp.text,
          type: 'application/json'
        });
      });
    });
}

function respond(data) {
  const response = defaults(data, {
    status: !data.body ? 404 : 200,
    body: 'Not found',
    type: 'text/plain'
  });

  this.type = response.type;
  this.status = response.status;
  this.body = response.body;
}

router.all('*', function *(next) {
  const url = this.req.url;
  const resource = path.join(baseDir, root, [url, 'json'].join('.'));

  const pong = respond.bind(this);

  if (url.match(rootPattern) || url.match('favicon.ico')) {
    return pong({
      status: 404
    });
  }

  logResource(resource);

  if (yield fs.exists(resource)) {
    this.body = yield send(resource);
    this.type = 'application/json';
  }
  else {
    const response = yield through(url);
    this.status = response.status;
    this.body = response.body;
    this.type = response.type ? response.type : 'text/plain';
  }
});
app.use(router.routes());
app.use(router.allowedMethods());

var fn = app.callback();
var options = {
  port: process.env.PORT || 5000
};

require('http').createServer(fn).listen(options, function (err) {
  if (err) throw err;
  console.log('Koala app listening on port %s', this.address().port);
});
