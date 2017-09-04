var temp     = require('temp');
var download = require('./util/download');
var extract  = require('./util/extract');
var fs       = require('fs');
var xml2js   = require('xml2js');
var META_FILE_NAME = 'maven-metadata.xml';

module.exports = function(grunt) {

  grunt.registerMultiTask('nexus', 'A plugin for downloading tarballed artifacts from a Nexus repository', function() {

    // merge task-specific and/or target-specific options with these defaults
    var options = this.options({
      unpack: true,
      extension: '.tar.gz'
    });

    // merge options onto data, with data taking precedence
    var data = this.data;
    data = grunt.util._.merge(options, data);

    // preparing inputs
    data.groupId = data.groupId.replace(/\./g, '/'); // dots to slashes
    data.baseUrl = data.baseUrl.replace(/\/?$/, ''); // remove trailing slash
    data.path = data.path.replace(/\/?$/, '');       // remove trailing slash
    if (data.extension.match(/^[^\.]/)) {            // ensure extension starts with a dot
      data.extension = '.' + data.extension;
    }
    if (data.strictSSL === undefined) {
        data.strictSSL = true;
    }

    var done = this.async();
    var anErrorOccurred = false;

    grunt.util.async.forEach(Object.keys(data.dependencies), function(dependency, callback) {

      var artifact = {
        id: dependency,
        version: data.dependencies[dependency]
      };
      var file = [artifact.id, artifact.version];
      if (data.classifier !== undefined) {
        file.push(data.classifier);
      }
      file = file.join('-') + data.extension;
      var folder = data.baseUrl + '/' + data.repository + '/' + data.groupId + '/' + artifact.id + '/' + artifact.version;
      var baseUri = data.baseUrl + '/' + data.repository + '/' + data.groupId + '/' + artifact.id + '/' + artifact.version;
      var uri = baseUri + '/' + file;
      var dir = data.path + '/' + artifact.id;
      var target;
      if (data.unpack) {
        target = temp.path({prefix: 'grunt-nexus-', suffix: data.extension});
      } else {
        target = data.path + '/' + file;
      }

      grunt.log.ok('Downloading ' + uri);
      download(uri, target, data.strictSSL)
      .then(function() {
        if (data.unpack) {
          return extract(target, dir);
        }
      })
      .then(function() {
        grunt.log.ok('Successfully installed '+artifact.id+':'+artifact.version);
        callback();
      }, function(error) {
        if (error.message.indexOf('404') !== -1) {
          var metaUri = baseUri + '/' + META_FILE_NAME;
          var metaTarget = data.path + '/' + artifact.id + '-' + artifact.version + '-' + META_FILE_NAME; 
          grunt.log.ok('Fetching maven metadata from ' + metaUri);
          download(metaUri, metaTarget, data.strictSSL)
          .then(function() {
            var parser = new xml2js.Parser();
            fs.readFile(metaTarget, function(err, _data) {
                parser.parseString(_data, function (err, result) {
                    var meta = result.metadata.versioning[0].snapshotVersions[0].snapshotVersion[0];
                    file = [artifact.id, meta.value, data.classifier].join('-') + data.extension;
                    uri = baseUri + '/' + file;
                    grunt.log.ok('Downloading ' + uri);
                    download(uri, data.path + '/' + file, data.strictSSL)
                    .then(function() {
                        fs.unlink(target, function() {
                          fs.unlink(metaTarget, function() {
                            grunt.log.ok('Successfully downloaded '+ data.path + '/' + file);
                            callback();
                          })
                        })
                    }, function(error) {
                      grunt.log.error('Error when '+error.when+' '+artifact.id+':'+artifact.version+': '+error.message);
                      anErrorOccurred = true;
                      callback();
                    });
                });
            });
          }, function(error) {
            grunt.log.error('Error when '+error.when+' '+artifact.id+':'+artifact.version+': '+error.message);
            anErrorOccurred = true;
            callback();
          });
        } else {
          grunt.log.error('Error when '+error.when+' '+artifact.id+':'+artifact.version+': '+error.message);
          anErrorOccurred = true;
          callback();
        }
      });

    }, function(error) {
      done(!anErrorOccurred);
    });

  });

};
