const NodeCache = require( "node-cache" );

const client = new NodeCache();;

class Cache {
    constructor() {
        this.client = client; 
    }
    // initialize
    init() {
       console.log("Node cache instance initiated..."); 
    }

    // main functions
    setItem(key, data) {
        this.client.set(key, JSON.stringify(data))
    }
    setExpItem(key, data, time) {
        this.client.set(key, JSON.stringify(data), time || 200); 
    }
    getItem(key) {
        const value = this.client.get(key); 

        if (value) return JSON.parse(value); 
        return null; 
    }

    removeItem (key) {
        const value = this.getItem(key);
        if (value) this.client.del(key); 
    }
}


module.exports = new Cache(); 
