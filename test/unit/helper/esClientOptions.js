const esClientOptions = require('../../../helper/esClientOptions');

module.exports.tests = {};

module.exports.tests.keepAlive = function(test, common) {
  test('keepAlive: false disables agent keep-alive', function(t) {
    const options = esClientOptions({ keepAlive: false, hosts: [{ host: 'es', port: 9200 }] });
    t.deepEqual(options.nodes, ['http://es:9200']);
    t.deepEqual(options.agent, { keepAlive: false });
    t.end();
  });

  test('keepAlive unset or true keeps client defaults', function(t) {
    t.equal(esClientOptions({}).agent, undefined);
    t.equal(esClientOptions({ keepAlive: true }).agent, undefined);
    t.end();
  });
};

module.exports.all = function (tape, common) {

  function test(name, testFunction) {
    return tape('[helper] esClientOptions: ' + name, testFunction);
  }

  for( var testCase in module.exports.tests ){
    module.exports.tests[testCase](test, common);
  }
};
