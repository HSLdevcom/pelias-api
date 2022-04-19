const logger = require('pelias-logger').get('api');
const _ = require('lodash');

// simple deuplication by document id. Multi query system may collect the same doc many times
function dedupeResultsById(req, res, next) {

  // do nothing if request data is invalid
  if(!_.isPlainObject(req.clean) ){ return next(); }

  // do nothing if no result data is invalid
  if( _.isUndefined(res) || !_.isArray(res.data) || _.isEmpty(res.data) ){ return next(); }

  let unique = [];
  let ids = {}; // hashmap of already collected ids

  for (let i=0; i<res.data.length; i++) {
    let hit = res.data[i];
    if (ids[hit._id]) {
      continue;
    } else {
      unique.push(hit);
      ids[hit._id] = true;
    }
  }
  res.data = unique;

  next();
}

module.exports = function() {
  return dedupeResultsById;
};
