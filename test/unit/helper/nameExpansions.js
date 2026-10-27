var proxyquire = require('proxyquire');

var customConfig = {
  generate: function generate() {
    return {
      api : {
        localization : {
          translations: '../translations.json',
        }
      }
    };
  }
};
var expansions = proxyquire('../../../helper/nameExpansions', { 'pelias-config': customConfig });
var expandByCategory = expansions[0];

module.exports.tests = {};

module.exports.tests.expandByCategory = function(test, common) {
  function expand(categories, lang) {
    return expandByCategory([{ name: 'Place', category: categories }], lang)[0];
  }

  test('exact category is translated', function(t) {
    t.equal(expand(['industry:agriculture'], 'fi'), 'Place (maatalous)');
    t.equal(expand(['industry:agriculture'], 'en'), 'Place (farming)');
    t.end();
  });

  test('subcategory falls back to its parent category', function(t) {
    t.equal(expand(['food:cuisine:thai'], 'fi'), 'Place (ravinto)');
    t.equal(expand(['transport', 'transport:air:airport'], 'en'), 'Place (transport)');
    t.end();
  });

  test('longer category names are not shadowed by shorter keys', function(t) {
    t.equal(expand(['transport terminal'], 'fi'), 'Place (liikenneterminaali)');
    t.equal(expand(['national park'], 'fi'), 'Place (kansallispuisto)');
    t.equal(expand(['unpopulated area'], 'en'), 'Place (unpopulated area)');
    t.end();
  });

  test('untranslated category is kept as is', function(t) {
    t.equal(expand(['recreation'], 'en'), 'Place (recreation)');
    t.equal(expand(['recreation'], undefined), 'Place (recreation)');
    t.end();
  });
};

module.exports.all = function (test, common) {
  for( var testCase in module.exports.tests ){
    module.exports.tests[testCase](test, common);
  }
};
