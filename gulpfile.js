var gulp = require("gulp");
var decompress = require('gulp-decompress');
var download = require("gulp-download");
var git = require('gulp-git');
var replace = require('gulp-replace-task');
var unzip = require("gulp-unzip");

var del = require('del');
var minimist = require('minimist');
var properties = require('java-properties');

var config = require('./config.json');

gulp.task("clean-en-US", function() {
  const knownOptions = {
    string: ["channel"],
    default: { channel: config.channel }
  };
  const argv = minimist(process.argv.slice(2), knownOptions);
  return del([argv.channel+"/en-US/**"]);
});

gulp.task("get-en-US", ["clean-en-US"], function() {
  // define baseurls or repositories based on command line arguments
  const knownOptions = {
    string: ["channel", "mozrev", "commrev"],
    default: {
      channel: config.channel,
      mozrev: "tip",
      commrev: "tip"
    }
  };
  const argv = minimist(process.argv.slice(2), knownOptions);
  const mozCentralRepo = config.repositories[argv.channel].mozillaCentral;
  const mozCentralBaseurl = mozCentralRepo+"/archive/"+argv.mozrev+".tar.gz";
  // http://hg.mozilla.org/mozilla-central/archive/tip.tar.gz
  const commCentralRepo = config.repositories[argv.channel].commCentral;
  const commCentralBaseurl = commCentralRepo+"/archive/"+argv.commrev+".tar.gz";
  // http://hg.mozilla.org/comm-central/archive/tip.tar.gz
  const chatzillaRepo = config.repositories.extensions.chatzilla;
  const chatzillaBaseurl = chatzillaRepo+"/archive/tip.tar.gz";
  const inspectorRepo = config.repositories.extensions.inspector;
  const inspectorBaseurl = inspectorRepo+"/archive/tip.tar.gz";
  const venkmanRepo = config.repositories.extensions.venkman;
  const venkmanBaseurl = venkmanRepo+"/archive/tip.tar.gz";
  
  function getArchive(baseurl, directoryMap) {
    Object.keys(directoryMap).forEach(function(dirKey, index, array) {
      var path = dirKey.replace(/\/$/,"");
      var url = baseurl + "/" + path;
      download(url)
        .pipe(decompress({strip: path.split("/").length + 1}))
        .pipe(gulp.dest(argv.channel+"/en-US/"+directoryMap[dirKey]));
    });
  }
  
  getArchive(mozCentralBaseurl, config.directoryMap.mozillaCentral);
  getArchive(commCentralBaseurl, config.directoryMap.commCentral);
  getArchive(chatzillaBaseurl, config.directoryMap.extensions.chatzilla);
  getArchive(inspectorBaseurl, config.directoryMap.extensions.inspector);
  getArchive(venkmanBaseurl, config.directoryMap.extensions.venkman);
});

gulp.task("get-ja", function() {
  const path = config.path.geckoL10n;
  
  git.pull("origin", "master", { args: "", cwd: path }, function (err) {
    if (err) {
      git.clone(config.repositories.l10n.gecko, { args: path }, function (err) {
        if (err) throw err;
      });
    }
  });
});

gulp.task("clean-converted", function() {
  const knownOptions = {
    string: ["channel", "locale"],
    default: {
      channel: config.channel,
      locale: "ja"
    }
  };
  const argv = minimist(process.argv.slice(2), knownOptions);
  return del([argv.channel+"/"+argv.locale+"/**"]);
});

gulp.task("convert", ["clean-converted"], function() {
  const knownOptions = {
    string: ["channel", "locale", "src", "filter"],
    default: {
      channel: config.channel,
      locale: "ja",
      src: config.path.geckoL10n+"/ja",
      filter: config.path.filter
    }
  };
  const argv = minimist(process.argv.slice(2), knownOptions);
  const prefix = "@@";
  const postfix = "@@";
  const allFilter = require("./"+argv.filter);
  const jaFilter = properties.of("gecko-l10n/ja.filters").objs;

  var localeFilter = {};
  Object.keys(allFilter[argv.locale]).forEach(function(key) {
    localeFilter[prefix+key+postfix] = allFilter[argv.locale][key];
  });
  Object.keys(allFilter["all"]).forEach(function(key) {
    localeFilter[prefix+key+postfix] = allFilter["all"][key];
  });
  Object.keys(jaFilter).forEach(function(key) {
    if (key.indexOf("ja.") == 0) {
      if (argv.locale == "ja") {
        localeFilter[prefix+key.substr(3)+postfix] = jaFilter[key];
      }
    } else if (key.indexOf("ja-JP-mac.") == 0) {
      if (argv.locale == "ja-JP-mac") {
        localeFilter[prefix+key.substr(10)+postfix] = jaFilter[key];
      }
    } else {
      localeFilter[prefix+key+postfix] = jaFilter[key];
    }
  });
  // tweak newline chars in intl.css.* filter
  localeFilter[prefix+"intl.css.common"+postfix] = localeFilter[prefix+"intl.css.common"+postfix].replace(/\\n/g, "\n");
  localeFilter[prefix+"intl.css.locale"+postfix] = localeFilter[prefix+"intl.css.locale"+postfix].replace(/\\n/g, "\n");
  
  gulp.src(argv.src+"/**")
    .pipe(replace({
      patterns: [
        { json: localeFilter }
      ],
      prefix: ""
    }))
    .pipe(gulp.dest(argv.channel+"/"+argv.locale));
});

gulp.task("compare", function() {
  console.log("not implemented yet");
});

gulp.task("errorcheck", function() {
  console.log("not implemented yet");
});
