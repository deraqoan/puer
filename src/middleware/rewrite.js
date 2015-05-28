
var path2reg = require("path-to-regexp");
var proxy = require('../util/proxy.js');
var notifier = require('node-notifier');
var helper = require('../util/helper');
var saveFile = require('save-file');
var chokidar = require('chokidar');
var libPath = require('path');
var chalk = require('chalk');
var async = require('async');
var libUrl = require('url');
var glob = require('glob');
var fs = require('fs');


function processHandle( handle, rulePath ){
  var type = typeof handle;
  var ruleDir;

  if(typeof rulePath === 'string'){
    ruleDir = libPath.dirname( rulePath );
  }else{
    ruleDir = process.cwd();
  }

  if(type === 'string' ){ // proxy or file send

    if( handle.indexOf('http') === 0 ) { // http or https
      return function( req, res ){
        // todo
        var relUrl = helper.encode( handle, req.params );

        if(relUrl !== handle){
          req.url = libUrl.parse(relUrl).path;
        }
        return proxy( req, res, {
          target: relUrl,
          prependPath: relUrl === handle

        }) 
      }
    }
    // if( fs.existsSync( filepath ) ){
    return function( req, res, next){
      var relativePath =  helper.encode( handle, req.params)
      var filepath = libPath.resolve( ruleDir, relativePath );
      if( fs.existsSync( filepath  ) ){
        return res.sendFile( filepath );
      }else{
        res.send(handle)
      }
    }
  }
  if(type !== 'function' ){
    return function(req, res){
      res.send(handle)
    }
  }
  return handle;
}
function processRule(rules, rulePath){
  var rst = []
  for(var i in rules) if ( rules.hasOwnProperty(i) ){
    rst.push(createRule(i, rules[i], rulePath) )
  }
  return rst;
}
function createRule( path, handle, rulePath){
  var tmp = path.split(/\s+/), method = "all";
  if( tmp[0] && tmp[1] ) {
    method = tmp[0].toLowerCase();
    path = tmp[1];
  }
  var regexp = path2reg( path );
  handle = processHandle(handle, rulePath)
  return {
    method: method,
    path: path,
    regexp: regexp,
    keys: regexp.keys,
    handle: handle
  } 
}

function rewriteMiddleware( options ){


  var ruleCache = {defaults: []};

  processRules( options.rules, ruleCache );


  return function rule( req, res, next ){

    var url = libUrl.parse( req.url );
    var method = req.method.toLowerCase();

    // checking ruleCache
    for(var i in ruleCache){
      var rules = ruleCache[i];
      for(var i = 0, len = rules.length; i < len; i++ ){

        var rule = rules[i];

        if((rule.method === 'all' || rule.method === method) && rule.regexp ){

          var params = helper.getParam( rule.regexp ,url.pathname);

          if(params && rule.handle) {

            req.params = params;
            return rule.handle(req, res, next);
          }

        }
      }
    }

    // checking resource 
    next();
  }
}

function processRules(rules, ruleCache){

  if( typeof rules === 'string' ){
    chokidar.watch(rules).on('all', function( event, path ){
      var logPath = chalk.underline.italic( path );
      switch(event){
        case 'add':
        case 'change':
          try{
            if( libPath.extname(path) === '.js'){
              delete require.cache[path];
              ruleCache[path] = processRule(require(path), path);
            }
            helper.log( 'rule ' + logPath + ' synchronized');
          }catch(e){ 
            notifier.notify({
              title: 'some error occurs in ' + path,
              message: e.message
            })
            helper.log( logPath + '\n\t' + e.message, 'error') 
          }
          break;
        case 'unlink':
          delete ruleCache[path]
          break;
        case 'error':
          helper.log('Some Error happend:' + path, 'error');
      }
    })
  }else{
    ruleCache['$defaults'] = processRules( options.rules, options.dir );
  }
}


module.exports = rewriteMiddleware;