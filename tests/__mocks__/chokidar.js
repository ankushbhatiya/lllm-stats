const { EventEmitter } = require('events');

class MockWatcher extends EventEmitter {
    close() {}
}

function watch(path, options) {
    return new MockWatcher();
}

module.exports = {
    watch
};
