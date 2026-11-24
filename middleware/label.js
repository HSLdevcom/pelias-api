var _ = require('lodash');
var labelGenerator = require('../helper/labelGenerator');
var nameExpansions = require('../helper/nameExpansions');
var geolib = require('geolib');
var differenceReason = require('../helper/diffPlaces').differenceReason;
var placeTypes = require('../helper/placeTypes');
var logger = require('pelias-logger').get('api:label');

/* A very much client specific option to consider the layer as a separating factor
   without actually adding it to the name.  The client can display a layer specific
   icon to make a difference between identical labels
*/
var ignoreLayer = false;

function setup() {
  return addLabels;
}

function addLabels(req, res, next) {
  // do nothing if no result data set
  if (!res || !res.data) {
    return next();
  }

  var lang;
  if (req.clean) {
    lang = req.clean.lang;
  }
  lang = lang || 'default';

  var data = res.data;

  // create initial labels
  data.forEach(function(place) {
    place.label = labelGenerator(place, req);
  });

  // then check duplicates and add details until (hopefully) all unique
  var todo = [];
  for (var ci = 0; ci < data.length; ci++) {
    todo.push(ci);  // indices of unprocessed items
  }

  while(todo.length>0) {
    var current = []; // indices of the next set of identical labels to process
    current.push(todo.pop()); // order does not matter, just take the last
    var label = data[current[0]].label.toLowerCase();
    var layer = data[current[0]].layer;
    var len = todo.length;

    var j = 0; // current index in todo arr
    for (var i=0; i<len; i++) {
      var val = todo[j];
      if(data[val].label.toLowerCase() === label) {
        if(ignoreLayer || data[val].layer === layer) {
          current.push(val);
          todo.splice(j, 1);
        } else {
          j++; // move to next index
        }
      } else {
        j++;
      }
    }
    if (layer === 'address' && current.length > 1) {
      var identical = [];
      for (var ii = 0; ii < current.length; ii++) {
        identical.push(data[current[ii]]);
      }
      logIdenticalAddresses(req, identical);
    }
    for(var exp = 0; exp < nameExpansions.length; exp++) {
      len = current.length;

      if(len < 2 ) { // single item is unique, nothing to do
        break;
      }
      var referenceSet = []; // some expansions might wish to know other items
      for(var ri=0; ri<current.length; ri++) {
        referenceSet.push(data[current[ri]]);
      }
      var expandedNames = nameExpansions[exp](referenceSet, lang);
      // see if that helped - if all still identical, skip the useless expansion
      if (!differentArrayItems(expandedNames)) {
         continue;
      }

      // assign expanded names to docs
      for(var ei=0; ei<current.length; ei++) {
        data[current[ei]].expandedName = expandedNames[ei];
      }

      // regenerate labels for unique cases and  remove them from current set
      j = 0;
      len=current.length;
      for (var k=0; k<len; k++) {
        if(uniqueArrayItem(expandedNames, k)) {
          var cj = current[j];
          data[cj].label = labelGenerator(data[cj], req);
          current.splice(j, 1);
        } else {
          j++; // next index
        }
      }
    }

    // all expansions done. Assign expanded labels although there can be non-unique cases
    for(var li=0; li<current.length; li++) {
      data[current[li]].label = labelGenerator(data[current[li]], req);
    }
  }

  next();
}

// Diagnostics: several address results survived dedupe with identical labels.
// Log the request and why dedupe regarded the results as different.
function logIdenticalAddresses(req, docs) {
  var clean = req.clean || {};
  var summarize = function(doc) {
    var parentIds = {};
    placeTypes.forEach(function(type) {
      var ids = _.get(doc, ['parent', type + '_id']);
      if (!_.isUndefined(ids)) {
        parentIds[type] = ids;
      }
    });
    return {
      id: doc._id,
      center: doc.center_point,
      zip: _.get(doc, 'address_parts.zip'),
      popularity: doc.popularity,
      parentIds: parentIds
    };
  };
  var pairs = [];
  var shown = docs.slice(0, 5);
  for (var a = 0; a < shown.length; a++) {
    for (var b = a + 1; b < shown.length; b++) {
      var meters = null;
      if (shown[a].center_point && shown[b].center_point) {
        meters = geolib.getDistance(
          { latitude: shown[a].center_point.lat, longitude: shown[a].center_point.lon },
          { latitude: shown[b].center_point.lat, longitude: shown[b].center_point.lon });
      }
      pairs.push({
        ids: [shown[a]._id, shown[b]._id],
        distance: meters,
        reason: differenceReason(shown[a], shown[b], clean.dedupestops)
      });
    }
  }
  logger.warn('[identical address labels]', JSON.stringify({
    request: _.pick(clean, ['text', 'size', 'layers', 'sources', 'lang', 'dedupestops',
      'focus.point.lat', 'focus.point.lon']),
    label: docs[0].label,
    docs: shown.map(summarize),
    pairs: pairs
  }));
}

function differentArrayItems(arr) {
  var len = arr.length;
  for(var i=0; i<len; i++) {
    var str = arr[i].toLowerCase();
    for(var j=i+1; j<len; j++) {
      if(str !== arr[j].toLowerCase()) {
        return true;
      }
    }
  }
  // all identical
  return false;
}

function uniqueArrayItem(arr, i) {
  var str = arr[i].toLowerCase();
  for(var j=0; j<arr.length; j++) {
    if(i !== j && str === arr[j].toLowerCase()) {
      return false;
    }
  }
  return true;
}

module.exports = setup;
