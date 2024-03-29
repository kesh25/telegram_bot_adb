module.exports = {
  apps : [{
    name        : "name",
    script      : "./index.js",
    watch       : true,
    env_production : {
       "NODE_ENV": "production"
    }
  },{
    name       : "name",
    script     : "./index.js",
    instances  : "max",
    exec_mode  : "cluster"
  }]
}
