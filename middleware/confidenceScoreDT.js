/**
 * Basic confidence score should be computed and returned for each item in the results.
 * The score should range between 0-1, and take into consideration as many factors as possible.
 */

var stats = require('stats-lite');
var logger = require('pelias-logger').get('api');
var check = require('check-types');
var _ = require('lodash');
var fuzzy = require('../helper/fuzzyMatch');
var stringUtils = require('../helper/stringUtils');
const codec = require('pelias-model').codec;
var normalize = stringUtils.normalize;
var removeNumbers = stringUtils.removeNumbers;
var languages = ['default'];
var adminWeights;
var minConfidence=0, relativeMinConfidence;
var genitiveThreshold = 0.8;

// default configuration for address confidence check
var confidenceAddressParts = {
  number: { parent: 'address_parts', field: 'number', numeric: true, weight: 0.5 },
  street: { parent: 'address_parts', field: 'street', numeric: false, weight: 1 },
  postalcode: { parent: 'address_parts', field: 'zip', numeric: false, weight: 1 },
  state: { parent: 'parent', field: 'region_a', numeric: false, weight: 3},
  country: { parent: 'parent', field: 'country_a', numeric: false, weight: 4 }
};

// layers priority in result sorting
var layers = [
  'neighbourhood',
  'bikestation',
  'stop',
  'venue',
  'address',
  'street',
  'station',
  'borough',
  'locality',
  'localadmin',
  'county',
  'macrocounty',
  'region',
  'macroregion',
  'dependency',
  'country'
];

// source priority in result sorting
var sources = [
  'openstreetmap' // prefer OSM to entries missing from this table (i.e. index == -1)
];

function setup(peliasConfig) {
  if (check.assigned(peliasConfig)) {
    if (peliasConfig.languages) {
      languages = _.uniq(languages.concat(peliasConfig.languages));
    }
    if(peliasConfig.minConfidence) {
      minConfidence = peliasConfig.minConfidence;
    }
    if (peliasConfig.layerPriority) {
      layers = peliasConfig.layerPriority;
    }

    relativeMinConfidence = peliasConfig.relativeMinConfidence;

    var localization = peliasConfig.localization;
    if (localization) {
      if(localization.confidenceAdminWeights) {
        adminWeights = localization.confidenceAdminWeights;
      }
      if(localization.confidenceAddressParts) {
        confidenceAddressParts = localization.confidenceAddressParts;
      }
    }
  }
  return computeScores;
}


function removeNumbers(val) {
  return val.replace(/[0-9]/g, '').trim();
}

function compareProperty(p1, p2) {
  if (Array.isArray(p1)) {
    p1 = p1[0];
  }
  if (Array.isArray(p2)) {
    p2 = p2[0];
  }

  if (!p1 || !p2) {
    return 0;
  }
  if (typeof p1 === 'string'){
    p1 = p1.toLowerCase();
  }
  if (typeof p2 === 'string'){
    p2 = p2.toLowerCase();
  }
  return (p1<p2?-1:(p1>p2?1:0));
}

function decodeAddendum(a_dum) {
  let addendum = {};
  for(let namespace in a_dum){
    try {
      addendum[namespace] = codec.decode(a_dum[namespace]);
    } catch( e ){
      logger.warn(`failed to decode addendum namespace ${namespace}`);
    }
  }
  return addendum;
}

/* Quite heavily fi specific sorting */
function compareResults(a, b) {
  if (b.confidence !== a.confidence) {
    return b.confidence - a.confidence;
  }
  if (a.popularity || b.popularity) {
    var apop = a.popularity || 10;
    var bpop = b.popularity || 10;
    if (apop !== bpop) {
      return bpop - apop;
    }
  }
  if (a.distance !== b.distance) {  // focus point defined
    return a.distance - b.distance;
  }
  var diff;
  if (a.parent && b.parent) {
    diff = compareProperty(a.parent.localadmin, b.parent.localadmin);
    if (diff) {
      return diff;
    }
  }
  if (a.address_parts && b.address_parts) {
    diff = compareProperty(a.address_parts.street, b.address_parts.street);
    if (diff) {
      return diff;
    }
    var n1 = parseInt(a.address_parts.number);
    var n2 = parseInt(b.address_parts.number);
    if (!isNaN(n1) && !isNaN(n2)) {
      diff = compareProperty(n1, n2);
      if (diff) {
        return diff;
      }
    }
  }
  if (a.name && b.name) {
    diff = compareProperty(a.name.default, b.name.default);
    if (diff) {
      return diff;
    }
  }
  if(a.addendum && b.addendum) {
    var plat1 = _.get(decodeAddendum(a.addendum), 'GTFS.platform');
    var plat2 = _.get(decodeAddendum(b.addendum), 'GTFS.platform');
    if (plat1 && plat2) {
      var p1 = parseInt(plat1);
      var p2 = parseInt(plat2);
      var l1 = p1 + '';
      var l2 = p2 + '';
      if (!isNaN(p1) && !isNaN(p2) && l1.length===plat1.length && l2.length===plat2.length) {
        // use numeric comparison
        plat1 = p1;
        plat2 = p2;
      }
      diff = compareProperty(plat1, plat2);
      if (diff) {
        return diff;
      }
    }
  }
  if(a.layer !== b.layer) { // larger has higher priority
    return layers.indexOf(b.layer) - layers.indexOf(a.layer);
  }
  if(a.source !== b.source) {
    return sources.indexOf(b.source) - sources.indexOf(a.source);
  }

  return 0;
}


function computeScores(req, res, next) {
  // do nothing if no result data set
  if (!check.assigned(req.clean) || !check.assigned(res) ||
      !check.assigned(res.data) || res.data.length===0 || !check.assigned(res.meta)) {
    return next();
  }

  // loop through data items and determine confidence scores
  res.data = res.data.map(computeConfidenceScore.bind(null, req));

  res.data.sort(compareResults);

  // don't return poor results
  var bestConfidence = res.data[0].confidence;
  var limit = minConfidence;
  if(relativeMinConfidence) {
    limit = Math.max(limit, relativeMinConfidence * bestConfidence);
  }
  res.data = res.data.filter(function(doc) {
    return(doc.confidence>limit);
  });

  next();
}

function countWords(str) {
  return str.split(/\s+/).length;
}

/**
 * Check all types of things to determine how confident we are that this result
 * is correct.
 *
 * @param {object} req
 * @param {object} hit
 * @returns {object}
 */
function computeConfidenceScore(req, hit) {

  var parsedText = req.clean.parsed_text;
  var weightSum;

  // compare parsed name (or raw text) against configured language versions of name
  if((parsedText && (parsedText.name || parsedText.query)) || req.clean.text) {
    hit.confidence = checkName(req.clean.text, parsedText, hit);
    weightSum = 1;
  } else {
    hit.confidence = 0;
    weightSum = 0;
  }

  // compare address parts one by one
  if (parsedText) {
    for(var key in confidenceAddressParts) {
      if(check.assigned(parsedText[key])) {
        hit.confidence += confidenceAddressParts[key].weight*checkAddressPart(parsedText, hit, key);
        weightSum += confidenceAddressParts[key].weight;
      }
    }
  }

  // score admin areas such as city or neigbourhood
  if(adminWeights && parsedText && parsedText.regions) {
    var adminConfidence = checkAdmin(parsedText.regions, hit);
    logger.debug('admin confidence', adminConfidence);
    // Keep admin scoring proportion constant 50% regardless of the
    // count of finer score factors. Score is max 0.5 if city is all wrong
    hit.confidence += weightSum*adminConfidence;
    weightSum *= 2;
  }

  if(weightSum>0) {
    hit.confidence /= weightSum; // normalize
  }

  // TODO: look at categories
  logger.info('### confidence', hit.confidence);

  return hit;
}


/**
 * Compare text string against configuration defined language versions of the name
 *
 * @param {string} text
 * @param {object} document with name and other props
 * @param {bool} remove numbers from examined property
 * @param {bool} variate names with admin parts & street
 * @returns {bool}
 */

function checkLanguageNames(text, doc, stripNumbers, tryGenitive) {
  var bestScore = 0;
  var bestName;
  var names = doc.name;
  var textLen = text.length;
  var parent = doc.parent || {};

  var checkNewBest = function(_text, name) {
    var score = fuzzy.match(_text, name);
    logger.debug('#', _text, '|', name, score);
    if (score >= bestScore ) {
      bestScore = score;
      bestName = name;
    }
    return score;
  };

  var checkAdminName = function(_text, admin, name) {
    admin = normalize(admin);
    if(admin && name.indexOf(admin) === -1) {
      checkNewBest(_text, admin + ' ' + name);
    }
  };

  var checkAdminNames = function(_text, admins, name) {
    admins.forEach(function(admin) {
      checkAdminName(_text, admin, name);
    });
  };

  var checkLanguageNameArray =  function(namearr) {
    for (var i in namearr) {
      var name = normalize(namearr[i]);
      if(stripNumbers) {
        name = removeNumbers(name);
      }
      var nameLen = name.length;
      var score = checkNewBest(text, name);

      if (score > genitiveThreshold && tryGenitive) { // don't prefix unless base match is OK
        // prefix with parent admins to catch cases like 'kontulan r-kioski = r-kioski, kontula'
        for(var key in adminWeights) {
          var admins = parent[key];
          var check = Array.isArray(admins) ? checkAdminNames : checkAdminName;
          if(textLen > 2 + nameLen) { // Shortest admin prefix is 'ii '
            check(text, admins, name);
            if (doc.street) { // try also street: 'helsinginkadun r-kioski'
              checkAdminName(text, doc.street, name);
            }
          }
          if (nameLen > 2 + textLen) {
            check(name, admins, text);
            if (doc.street) {
              checkAdminName(name, doc.street, text);
            }
          }
        }
      }
    }
  };

  for (var lang in names) {
    if (languages.indexOf(lang) === -1) {
      continue;
    }
    var nameArr = names[lang];
    if (!Array.isArray(nameArr)) {
      nameArr = [nameArr];
    }
    checkLanguageNameArray(nameArr);
  }
  logger.info('name confidence', bestScore, text, bestName);

  return bestScore;
}


/**
 * Compare text string or name component of parsed_text against
 * default name in result
 *
 * @param {string} text
 * @param {object|undefined} parsedText
 * @param {object} hit
 * @returns {number}
 */
function checkName(text, parsedText, hit) {
  var docIsVenue = hit.layer === 'venue' || hit.layer === 'stop' || hit.layer === 'station' || hit.layer === 'bikestation';

  // parsedText name should take precedence if available since it's the cleaner name property
  var name = parsedText ? parsedText.name || parsedText.query : null;
  if (name) {
    var searchIsVenue = !parsedText.street;
    var bestScore = checkLanguageNames(name, hit, false, docIsVenue && searchIsVenue);

    return(bestScore);
  }

  // if no parsedText check the full unparsed text value
  return(checkLanguageNames(text, hit, false, docIsVenue));
}


/**
 * Determine the quality of the property match
 *
 * @param {string|number} textProp
 * @param {string|number|undefined|null} hitProp
 * @param {boolean} numeric
 * @returns {number}
 */
function propMatch(textProp, hitProp, numeric) {

  // missing information is not quite as bad as totally wrong data
  if (!check.assigned(hitProp)) {
    return 0.1;
  }

  if (numeric) { // special treatment for numbers such as house number
    if(textProp === hitProp) {
      // handle exact match before dropping all but numeric part
      return 1.0;
    }
    var n1 = parseInt(textProp); // e.g. 4b -> 4, 3-5 -> 3
    var n2 = parseInt(hitProp);
    if (!isNaN(n1) && !isNaN(n2)) {
      return Math.sqrt(0.9/(1.0 + Math.abs(n1-n2)));
    }
  }

  return fuzzy.match(textProp.toString(), hitProp.toString());
}

// array wrapper for function above
function propMatchArray(text, hitProp, numeric) {
  if (Array.isArray(hitProp)) { // check all array values
    var maxMatch = 0;
    hitProp.forEach(function(value) {
      var match = propMatch(text, value, numeric);
      if (match>maxMatch) {
        maxMatch=match;
      }
    });
    return maxMatch;
  } else {
    return propMatch(text, hitProp, numeric);
  }
}


/**
 * Check a defined part of the parsed text address
 *
 * @param {object} text
 * @param {object} hit
 * @param {string} key
 */
function checkAddressPart(text, hit, key) {
  var value;
  var part = confidenceAddressParts[key];
  var parent = hit[part.parent];

  if (!parent) {
    value = null;
  } else {
    value = parent[part.field];
  }
  var score = propMatchArray(text[key], value, part.numeric);

  // special case: proper version can be stored in the name
  // we need this because street name currently stores only one language
  if(key==='street' && hit.name) {
    var _score = checkLanguageNames(text[key], hit, true, false);
    if(_score>score) {
      score = _score;
    }
  }
  logger.info('address confidence for ' + key, score);

  return score;
}


/**
 * Check admin properties against parsed values
 *
 * @param {values} text/array
 * @param {object} hit
 * @param {object} [hit.parent]
 * @returns {number}
 */
function checkAdmin(values, hit) {
  if (!Array.isArray(values)) {
    values = [values];
  }

  var sum=0, weightSum=0;

  values.forEach(function(value) {
    var best=0, weight = 1;
    var nvalue = removeNumbers(value);

    // loop trough configured properties to find best match
    for(var key in adminWeights) {
      var prop;
      if(key === 'street' && hit.address_parts) {
        prop = hit.address_parts.street;
      }
      else if (hit.parent) {
        prop = hit.parent[key];
      } else {
        prop = null;
      }
      if (prop) {
        var match;
        if ( Array.isArray(prop) ) {
          var nProp = [];
          for(var i in prop) {
            nProp.push(prop[i]);
          }
          match = fuzzy.matchArray(nvalue, nProp);
        } else {
          match = fuzzy.match(nvalue, prop);
        }
        if(match>best) {
          best = match;
          weight = adminWeights[key];
        }
      }
    }
    sum += weight*best;
    weightSum += weight;
  });

  return sum/weightSum;
}

module.exports = setup;
