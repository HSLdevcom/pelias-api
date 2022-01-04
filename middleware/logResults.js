var _ = require('lodash');
var logger = require('pelias-logger').get('api:debug');

function setup() {
  return logData;
}

function logData(req, res, next) {
  if (!res || !res.data) {
    return next();
  }

  res.data.forEach(function(place) {
    logger.warn(JSON.stringify(place) + '\n\n');
  });
  next();
}

module.exports = setup;
