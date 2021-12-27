var check = require('check-types');
var _ = require('lodash');
var logger = require('pelias-logger').get('api:middleware:translate');

var translations = {};

function setup() {
  var api = require('pelias-config').generate().api;
  var localization = api.localization;
  if (localization) {
    if (localization.translations) {
      translations = require(localization.translations);
    }
  }
  return translate;
}

function translateName(place, lang) {
  if( place.name ) {
    if( place.name[lang] ) {
      place.name = place.name[lang];
    } else if (place.name.default) { // fallback
      place.name = place.name.default;
    }
    if (place.name instanceof Array) {
      place.name = place.name[0];
    }
  }
}

function translateProp(lang, value, translations, name) {
  // property  to be translated is often related to the document name
  // for which we have a good data structure: name.fi, name.sv etc.
  // example: we can translate street='Fabianinkatu' to sv using names
  // name.fi = Fabianinkatu 10, name.sv = Fabiansgatan 10

  if (!value) {
    return null;
  }
  if (!name) {
    return translations[value];
  }
  var names = [];
  var namedef, namefi, namesv;

  if (name.default) {
    namedef = Array.isArray(name.default) ? name.default[0] : name.default;
    names.push(namedef);
  }
  if (name.fi) {
    namefi = Array.isArray(name.fi) ? name.fi[0] : name.fi;
    if(namefi !== namedef) {
      names.push(namefi);
    }
  }
  if (name.sv ) {
    namesv = Array.isArray(name.sv) ? name.sv[0] : name.sv;
    if(namesv !== namedef && namesv !== namefi) {
      names.push(namesv);
    }
  }
  var newVal;
  for (var i=0; i<names.length; i++) {
    var n = names[i];
    if (n.indexOf(value) === 0) {
      var len = n.length;
      var len2 = value.length;
      if (len === len2) {
	newVal = name[lang];
	if (Array.isArray(newVal)) {
	  newVal = newVal[0];
	}
      } else if (len > len2) {
	var postfix = n.substr(len2);
	var name2 = name[lang];
	if (Array.isArray(name2)) {
	  name2 = name2[0];
	}
	if (name2) {
          var tailIndex = name2.indexOf(postfix);
          if (tailIndex > 0) {
            // remove matching postifix (e.g. street number) to get the translation
            newVal = name2.substr(0, tailIndex);
          }
	}
      }
      if (newVal) {
        logger.debug('Translated ' + value + ' to ' + newVal);
        break;
      }
    }
  }
  // fallback to static dictionary
  return newVal || translations[value];
}

function translateProperties(lang, place, key, translations, name) {
  if(place[key]) {
    var newName;
    if (place[key] instanceof Array) {
      newName = translateProp(lang, place[key][0], translations, name);
      if (newName) {
        place[key][0] = newName;
      }
    } else {
      newName = translateProp(lang, place[key], translations, name);
      if (newName) {
        place[key] = newName;
      }
    }
  }
}

function translate(req, res, next) {

  // do nothing if no result data set
  if (!res || !res.data) {
    return next();
  }

  var lang;
  if (req.clean) {
    lang = req.clean.lang;
  }

  if( lang && translations[lang] ) {
    _.forEach(translations[lang], function(dict, key) {
      _.forEach(res.data, function(place) {
        translateProperties(lang, place, key, dict, place.name);
        if(place.parent) {
          translateProperties(lang, place.parent, key, dict, place.name);
        }
        if(place.address_parts) {
          translateProperties(lang, place.address_parts, key, dict, place.name);
        }
      });
    });
  }

  _.forEach(res.data, function(place) {
    translateName(place, lang);
  });

  next();
}

module.exports = setup;
