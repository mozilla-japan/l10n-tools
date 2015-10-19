var gulp = require("gulp");
var clipEmptyFiles = require('gulp-clip-empty-files');
var debug = require('gulp-debug');
var decompress = require("gulp-decompress");
var download = require("gulp-download");
var concatFilenames = require('gulp-concat-filenames');
var git = require("gulp-git");
var replace = require("gulp-replace-task");
var unzip = require("gulp-unzip");

var del = require("del");
var minimist = require("minimist");
var properties = require("java-properties");
var request = require("request");
var syncrequest = require('sync-request');

/**
 * load config files
 */
var config = require("./config.json");

/**
 * load l10n status files from one of:
 *   ./status.json - local directory file to override
 *   gecko-l10n/status.json - status file of working files
 *   status.json in github - github file can be used directory without local clone of gecko-l10n
 * status.json file is placed in gecko-l10n because it contain sync target status of the ja files in the repository
 */
try {
  var status = require("./status.json");
}
catch (e) {
  try {
    var status = require(config.file.statusInLocal);
  }
  catch (e) {
    console.log("Could not load "+config.file.status+". load from github...");
    var req = syncrequest("GET", config.file.statusInGithub);
    var status = JSON.parse(req.getBody("utf8"));
  }
}

/**
 * checkout branch of the local git repository
 * @param {string} branch - branch name to switch to
 * @param {string} path   - path to the local git repo
 */
function gitCheckoutBranch(branch, path) {
  path = path ? path : "./";
  git.checkout(branch, {cwd: path}, function (error) {
    if (error) {
      console.log("could not git checkout "+branch+" branch in "+path);
      throw error;
    }
  });
}  

/**
 * delete existing en-US directory
 */
gulp.task("clean-en-US", function() {
  const argv = minimist(process.argv.slice(2), {
    string: ["channel"],
    default: { channel: config.channel }
  });
  return del([argv.channel+"/en-US/**"]);
});

/**
 * get en-US files from hg.mozilla.org
 * @param {string} channel - target channel (release|beta|aurora|nightly)
 * @param {string} mozrev  - target mozilla-central revision (tip by default)
 * @param {string} commrev - target comm-central revision (tip by default)
 */
gulp.task("get-en-US", ["clean-en-US"], function() {
  const argv = minimist(process.argv.slice(2), {
    string: ["channel", "mozrev", "commrev"],
    default: {
      channel: config.channel,
      mozrev: "tip",
      commrev: "tip"
    }
  });
  const mozCentralRepo = config.repository.mozilla[argv.channel];
  const mozCentralBaseurl = mozCentralRepo+"/archive/"+argv.mozrev+".tar.gz";
  // http://hg.mozilla.org/mozilla-central/archive/tip.tar.gz
  const commCentralRepo = config.repository.comm[argv.channel];
  const commCentralBaseurl = commCentralRepo+"/archive/"+argv.commrev+".tar.gz";
  // http://hg.mozilla.org/comm-central/archive/tip.tar.gz
  const chatzillaRepo = config.repository.extensions.chatzilla;
  const chatzillaBaseurl = chatzillaRepo+"/archive/tip.tar.gz";
  const inspectorRepo = config.repository.extensions.inspector;
  const inspectorBaseurl = inspectorRepo+"/archive/tip.tar.gz";
  const venkmanRepo = config.repository.extensions.venkman;
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

/**
 * generate diff of en-US files between tip and current revision
 */
gulp.task("diff-to-sync", function() {
  console.log("not implemented yet");
});

/**
 * clone ja gecko-l10n repository from github (and checkout target branch)
 * if it already exists, pull latest files from github
 * @param {string} channel - target channel (release|beta|aurora|nightly)
 */
gulp.task("get-ja", function() {
  const argv = minimist(process.argv.slice(2), {
    string: ["channel"],
    default: {
      channel: config.channel
    }
  });
  const path = config.path.geckoL10n[argv.channel];
  const branch = status.branch[argv.channel];
  
  git.pull("origin", "master", {args: "", cwd: path}, function (error) {
    if (error) {
      console.log("local git repository not found in: "+path);
      console.log("git clone from: "+config.repository.l10n.gecko);
      git.clone(config.repository.l10n.gecko, { args: path }, function (error) {
        if (error) throw error;
        gitCheckoutBranch(branch, path);
      });
    } else {
      gitCheckoutBranch(branch, path);
    }
  });
});

/**
 * delete existing converted ja/ja-JP-mac files
 * @param {string} channel - target channel (release|beta|aurora|nightly)
 * @param {string} local   - target locale (ja|ja-JP-mac)
 */
gulp.task("clean-converted", function() {
  const argv = minimist(process.argv.slice(2), {
    string: ["channel", "locale"],
    default: {
      channel: config.channel,
      locale: "ja"
    }
  });
  return del([
    argv.channel+"/"+argv.locale+"/**/*",
    "!"+argv.channel+"/"+argv.locale+"/.{hg|git}"
  ]);
});

/**
 * generate converted ja files with filter.json
 * @param {string} channel - target channel (release|beta|aurora|nightly)
 * @param {string} local   - target locale (ja|ja-JP-mac)
 */
gulp.task("convert", ["clean-converted"], function() {
  const argv = minimist(process.argv.slice(2), {
    string: ["channel", "locale"],
    default: {
      channel: config.channel,
      locale: "ja",
    }
  });
  const prefix = "@@";
  const postfix = "@@";
  const jsonFilter = require(config.file.filter);
  const propertiesFilter = properties.of(config.path.geckoL10n[argv.channel]+"/ja.filters").objs;

  var localeFilter = {};
  Object.keys(jsonFilter[argv.locale]).forEach(function(key) {
    localeFilter[prefix+key+postfix] = jsonFilter[argv.locale][key];
  });
  Object.keys(jsonFilter["all"]).forEach(function(key) {
    localeFilter[prefix+key+postfix] = jsonFilter["all"][key];
  });
  Object.keys(propertiesFilter).forEach(function(key) {
    if (key.indexOf("ja.") == 0) {
      if (argv.locale == "ja") {
        localeFilter[prefix+key.substr(3)+postfix] = propertiesFilter[key];
      }
    } else if (key.indexOf("ja-JP-mac.") == 0) {
      if (argv.locale == "ja-JP-mac") {
        localeFilter[prefix+key.substr(10)+postfix] = propertiesFilter[key];
      }
    } else {
      localeFilter[prefix+key+postfix] = propertiesFilter[key];
    }
  });
  // tweak newline chars in intl.css.* filter
  localeFilter[prefix+"intl.css.common"+postfix] = localeFilter[prefix+"intl.css.common"+postfix].replace(/\\n/g, "\n");
  localeFilter[prefix+"intl.css.locale"+postfix] = localeFilter[prefix+"intl.css.locale"+postfix].replace(/\\n/g, "\n");
  
  gulp.src(config.path.geckoL10n[argv.channel]+"/ja/**")
    .pipe(replace({
      patterns: [
        { json: localeFilter }
      ],
      prefix: "" // prefix/postfix included in the keys of localeFilter
    }))
    .pipe(gulp.dest(argv.channel+"/"+argv.locale));
});

/**
 * compare en-US and ja/ja-JP-mac files
 */
gulp.task("compare", function() {
  console.log("not implemented yet");
});
