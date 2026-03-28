// Mock better-sqlite3 for testing
const mockOffsets = new Map();

class MockStatement {
    constructor(type) {
        this.type = type;
    }
    
    run(...args) {
        if (this.type === 'insert_offset') {
            mockOffsets.set(args[0], args[1]);
        }
        return { changes: 1, lastInsertRowid: 1 };
    }
    get(...args) {
        if (this.type === 'get_offset') {
            const value = mockOffsets.get(args[0]);
            return value !== undefined ? { last_offset: value } : undefined;
        }
        return {
            avg_tps: 45.5,
            max_tps: 60.2,
            total_tokens: 1000,
            model_id: 'test-model',
            generation_tps: 50,
            prompt_tps: 100,
            timestamp: new Date().toISOString()
        };
    }
    all(...args) {
        return [
            { bucket: '10:00', avg_tps: 45.5, count: 5 },
            { bucket: '10:15', avg_tps: 48.2, count: 3 }
        ];
    }
}

class MockDatabase {
    constructor(path) {
        this.path = path;
    }
    
    exec() {}
    pragma() { return {}; }
    close() {}
    prepare(sql) {
        if (sql.includes('SELECT last_offset')) {
            return new MockStatement('get_offset');
        }
        if (sql.includes('INSERT OR REPLACE')) {
            return new MockStatement('insert_offset');
        }
        return new MockStatement('default');
    }
}

module.exports = MockDatabase;
