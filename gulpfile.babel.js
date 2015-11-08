import gulp from "gulp";
import clipEmptyFiles from "gulp-clip-empty-files";
import debug from "gulp-debug";
import decompress from "gulp-decompress";
import download from "gulp-download";
import concatFilenames from "gulp-concat-filenames";
import git from "gulp-git";
import replace from "gulp-replace-task";
import unzip from "gulp-unzip";

import del from "del";
import minimist from "minimist";
import properties from "java-properties";
import request from "request";
import syncrequest from "sync-request";

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
    console.log(`Could not load ${config.file.status}. load from github...`);
    let req = syncrequest("GET", config.file.statusInGithub);
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
  git.checkout(branch, {cwd: path}, error => {
    if (error) {
      console.log(`could not git checkout ${branch} branch in ${path}`);
      throw error;
    }
  });
}  

/**
 * delete existing en-US directory
 */
gulp.task("clean-en-US", () => {
  const argv = minimist(process.argv.slice(2), {
    string: ["channel"],
    default: { channel: config.channel }
  });
  return del([`${argv.channel}/en-US/**`]);
});

/**
 * get en-US files from hg.mozilla.org
 * @param {string} channel - target channel (release|beta|aurora|nightly)
 * @param {string} mozrev  - target mozilla-central revision (tip by default)
 * @param {string} commrev - target comm-central revision (tip by default)
 */
gulp.task("get-en-US", ["clean-en-US"], () => {
  const argv = minimist(process.argv.slice(2), {
    string: ["channel", "mozrev", "commrev"],
    default: {
      channel: config.channel,
      mozrev: "tip",
      commrev: "tip"
    }
  });
  const mozCentralRepo = config.repository.mozilla[argv.channel];
  const mozCentralBaseurl = `${mozCentralRepo}/archive/${argv.mozrev}.tar.gz`;
  // http://hg.mozilla.org/mozilla-central/archive/tip.tar.gz
  const commCentralRepo = config.repository.comm[argv.channel];
  const commCentralBaseurl = `${commCentralRepo}/archive/${argv.commrev}.tar.gz`;
  // http://hg.mozilla.org/comm-central/archive/tip.tar.gz
  const chatzillaRepo = config.repository.extensions.chatzilla;
  const chatzillaBaseurl = `${chatzillaRepo}/archive/tip.tar.gz`;
  const inspectorRepo = config.repository.extensions.inspector;
  const inspectorBaseurl = `${inspectorRepo}/archive/tip.tar.gz`;
  const venkmanRepo = config.repository.extensions.venkman;
  const venkmanBaseurl = `${venkmanRepo}/archive/tip.tar.gz`;
  
  function getArchive(baseurl, directoryMap) {
    Object.keys(directoryMap).forEach((dirKey, index, array) => {
      var path = dirKey.replace(/\/$/,"");
      var url = `${baseurl}/${path}`;
      download(url)
        .pipe(decompress({strip: path.split("/").length + 1}))
        .pipe(gulp.dest(`${argv.channel}/en-US/${directoryMap[dirKey]}`));
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
gulp.task("diff-to-sync", () => {
  console.log("not implemented yet");
});

/**
 * clone ja gecko-l10n repository from github (and checkout target branch)
 * if it already exists, pull latest files from github
 * @param {string} channel - target channel (release|beta|aurora|nightly)
 */
gulp.task("get-ja", () => {
  const argv = minimist(process.argv.slice(2), {
    string: ["channel"],
    default: {
      channel: config.channel
    }
  });
  const path = config.path.geckoL10n[argv.channel];
  const branch = status.branch[argv.channel];
  
  git.pull("origin", "master", {args: "", cwd: path}, error => {
    if (error) {
      console.log(`local git repository not found in: ${path}`);
      console.log(`git clone from: ${config.repository.l10n.gecko}`);
      git.clone(config.repository.l10n.gecko, { args: path }, error => {
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
gulp.task("clean-converted", () => {
  const argv = minimist(process.argv.slice(2), {
    string: ["channel", "locale"],
    default: {
      channel: config.channel,
      locale: "ja"
    }
  });
  return del([
    `${argv.channel}/${argv.locale}/**/*`,
    `!${argv.channel}/${argv.locale}/.{hg|git}`
  ]);
});

/**
 * generate converted ja files with filter.json
 * @param {string} channel - target channel (release|beta|aurora|nightly)
 * @param {string} local   - target locale (ja|ja-JP-mac)
 */
gulp.task("convert", ["clean-converted"], () => {
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
  const propertiesFilter = properties.of(`${config.path.geckoL10n[argv.channel]}/ja.filters`).objs;

  var localeFilter = {};
  Object.keys(jsonFilter[argv.locale]).forEach(key => {
    localeFilter[prefix+key+postfix] = jsonFilter[argv.locale][key];
  });
  Object.keys(jsonFilter["all"]).forEach(key => {
    localeFilter[prefix+key+postfix] = jsonFilter["all"][key];
  });
  Object.keys(propertiesFilter).forEach(key => {
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
  
  gulp.src(`${config.path.geckoL10n[argv.channel]}/ja/**`)
    .pipe(replace({
      patterns: [
        { json: localeFilter }
      ],
      prefix: "" // prefix/postfix included in the keys of localeFilter
    }))
    .pipe(gulp.dest(`${argv.channel}/${argv.locale}`));
});

/**
 * compare en-US and ja/ja-JP-mac files
 */
gulp.task("compare", () => {
  console.log("not implemented yet");
});

/**
 * check generated ja/ja-JP-mac *.dtd files
 * this is simplified syntax check with regexp match:
 *   replace all valid header, footer and entity difinition part with ""
 *   if something left in the file, it contains some syntax error
 * @param {string} channel - target channel (release|beta|aurora|nightly)
 * @param {string} local   - target locale (ja|ja-JP-mac)
 */
gulp.task("errorcheck-dtd", () => {
  const argv = minimist(process.argv.slice(2), {
    string: ["channel", "locale"],
    default: {
      channel: config.channel,
      locale: "ja",
    }
  });
  // NameStartChar ::= ":" | [A-Z] | "_" | [a-z] | [#xC0-#xD6] | [#xD8-#xF6] | [#xF8-#x2FF] | [#x370-#x37D] | [#x37F-#x1FFF] | [#x200C-#x200D] | [#x2070-#x218F] | [#x2C00-#x2FEF] | [#x3001-#xD7FF] | [#xF900-#xFDCF] | [#xFDF0-#xFFFD] | [#x10000-#xEFFFF]
  const XML_NAME_START_CHAR = `:A-Z_a-z\\xC0-\\xD6\\xD8-\\xF6\\xF8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD`;
  // NameChar ::= NameStartChar | "-" | "." | [0-9] | #xB7 | [#x0300-#x036F] | [#x203F-#x2040]
  const XML_NAME_CHAR = `-${XML_NAME_START_CHAR}.0-9\\xB7\\u0300-\\u036F\\u203F-\\u2040`;  
  const XML_NAME = `[${XML_NAME_START_CHAR}][${XML_NAME_CHAR}]+`;
  const DTD_ID = XML_NAME;
  const DTD_VALUE_S = `[^'<]*(?:</?[a-z:A-Z.]+[^<>]*>[^'<]*)*`;
  const DTD_VALUE_D = `[^"<]*(?:</?[a-z:A-Z.]+[^<>]*>[^"<]*)*`;
  const DTD_COMMENT = `<!--[^-]*(?:-[^-]+)*?-->`;
  const DTD_ENTITY = ``;
  // license block
  const DTD_HEADER = `^\\ufeff?(?:\\s*<!--.*LICENSE BLOCK[^-]*(?:-[^-]+)*-->\\s*)?`;
  //                                                     <-- $1 = pre space
  // <!-- pre comment -->                                <-- $2 = pre comment
  // <!ENTITY entitykey "entityvalue"> <!-- comment -->  <-- $3 = definition
  // <--------------[3]--------------><------[6]------>      $6 = post comment
  //          <--[4]--> <----[5]---->                        $4 = key, $5 = value 
  const DTD_BLOCK = `^(\\s*)((?:${DTD_COMMENT}\\s*)*)`
    + `(<!ENTITY\\s+(?:%\\s+)?(${DTD_ID})\\s+(?:SYSTEM\\s+)?`
    + `('${DTD_VALUE_S}'|"${DTD_VALUE_D}")\\s*>)`
    + `((?:\\s*%${DTD_ID};)?`
    + `[ \\t]*(?:${DTD_COMMENT}[ \\t]*)*$\\n?)`;
  // any empty lines and comment blocks at the end of file
  const DTD_FOOTER = `\\s*(?:${DTD_COMMENT}\\s*)*$`;
  
  gulp.src(`${argv.channel}/${argv.locale}/**/*.dtd`)
    .pipe(replace({
      patterns: [ // remove header and footer part
        { match: new RegExp(DTD_HEADER), replacement: "" },
        { match: new RegExp(DTD_FOOTER), replacement: "" }
      ]
    }))
    .pipe(replace({ // check entities
      patterns: [ { match: new RegExp(DTD_BLOCK, "mg"), replacement: "" } ]
    }))
    .pipe(clipEmptyFiles())
    .pipe(debug({title: "Syntax Error found in: "}))
    .pipe(gulp.dest(`${argv.channel}/.errorcheck-${argv.locale}`))
    .pipe(concatFilenames(`${argv.channel}/dtd-filelist`));
});

/**
 * check generated ja/ja-JP-mac *.properties files
 * @param {string} channel - target channel (release|beta|aurora|nightly)
 * @param {string} local   - target locale (ja|ja-JP-mac)
 */
gulp.task("errorcheck-properties", () => {
  const argv = minimist(process.argv.slice(2), {
    string: ["channel", "locale"],
    default: {
      channel: config.channel,
      locale: "ja",
    }
  });
  const PROPERTIES_COMMENT = `[#!][^\\n]*`;
  //const PROPERTIES_KEY = `[^#!\\s][^:=\\s\\\\]*(?:\\\\.[^:=\\s\\\\]*)*`;
  // mozilla l10n local rule: use alphabet and some symbols only
  const PROPERTIES_KEY = `[-0-9a-zA-Z_.?/^{@}]+`;
  const PROPERTIES_VALUE = `[^\\s][^\\n\\\\]*(?:\\\\(?:.|\\n)[^\\n\\\\]*)*(?=\\s|$)`;
  const PROPERTIES_ENTITY = `${PROPERTIES_COMMENT}[ \\t]*[:=][^\\n\\\\]*(?:\\\\(?:.|\\n)[^\\n\\\\]*)*`;
  
  // license block
  const PROPERTIES_HEADER = `^(?:\\s*${PROPERTIES_COMMENT}\\n)*`
    + `(?:\\s*${PROPERTIES_COMMENT}(?:LICENSE BLOCK|mozilla.org/MPL/)[^\\n]*\\n)`
    + `(?:\\s*${PROPERTIES_COMMENT}\\n)*`;
  //                            <-- $1 = pre white space
  // # pre comment              <-- $2 = pre comment
  // entitykey = entityvalue    <-- $3 = definition
  // <--$4--->   <---$5---->        $4 = key, $5 = value
  const PROPERTIES_BLOCK	= `^(\\s*)((?:${PROPERTIES_COMMENT}\\n(?:[ \\t]*\\n)*)*)([ \\t]*(${PROPERTIES_KEY})[ \\t]*[:=][ \\t]*(?:(${PROPERTIES_VALUE})[ \\t]*)?)$\\n?`;
  const PROPERTIES_FOOTER = `\\n(?:[ \\t]*\\n)*`
    + `(?:${PROPERTIES_COMMENT}\\n\\s*)*(?:${PROPERTIES_COMMENT})?$`;
  
  gulp.src(`${argv.channel}/${argv.locale}/**/*.properties`)
    .pipe(replace({
      patterns: [{ match: /\r\n?/g, replacement: "\n" }]
    }))
    .pipe(replace({ // remove header first
      patterns: [ { match: new RegExp(PROPERTIES_HEADER), replacement: "" } ]
    }))
    .pipe(replace({ // remove footer
      patterns: [ { match: new RegExp(PROPERTIES_FOOTER), replacement: "" } ]
    }))
    .pipe(replace({ // check entities
      patterns: [ { match: new RegExp(PROPERTIES_BLOCK, "mg"), replacement: "" } ]
    }))
    .pipe(clipEmptyFiles())
    .pipe(debug({title: "Syntax Error found in: "}))
    .pipe(gulp.dest(`${argv.channel}/.errorcheck-${argv.locale}`))
    .pipe(concatFilenames(`${argv.channel}/properties-filelist`));
});

/**
 * check generated ja/ja-JP-mac *.inc files
 * @param {string} channel - target channel (release|beta|aurora|nightly)
 * @param {string} local   - target locale (ja|ja-JP-mac)
 */
gulp.task("errorcheck-inc", () => {
  const argv = minimist(process.argv.slice(2), {
    string: ["channel", "locale"],
    default: {
      channel: config.channel,
      locale: "ja",
    }
  });
  const INC_COMMENT = `#(?!define[ \\t])[^\\n]*`;
  const INC_ENTITY = `#define[ \\t]+\\w+[ \\t]+[^\\n]*`;
  // empty lines and one continuous comment block (no blank lines between comment lines)
  const INC_HEADER = `^(?:[ \\t]*\\n)*(?:${INC_COMMENT}\\n)*`;
  //                                  <-- $1 = pre white space
  // # pre comment                    <-- $2 = pre comment
  // #define entitykey entityvalue    <-- $3 = definition
  //         <--$4---> <---$5---->        $4 = key, $5 = value
  const INC_BLOCK = `^((?:[ \\t]*\\n)*)`
    + `((?:${INC_COMMENT}\\n(?:[ \\t]*\\n)*)*)`
    + `(#define[ \\t]+(\\w+)[ \\t]+([^\\n]*?))[ \\t]*$\\n?`;
  // any empty lines and comment blocks at the end of file
  const INC_FOOTER = `\\n(?:[ \\t]*\\n)*`
    + `(?:${INC_COMMENT}\\n(?:[ \\t]*\\n)*)*`
    + `${INC_COMMENT}(?:\\n(?:[ \\t]*\\n)*)?$`;
  
  gulp.src(`${argv.channel}/${argv.locale}/**/*.inc`)
    .pipe(replace({
      patterns: [
        { match: new RegExp(INC_HEADER), replacement: "" },
        { match: new RegExp(INC_FOOTER), replacement: "" }
      ]
    }))
    .pipe(replace({
      patterns: [ { match: new RegExp(INC_BLOCK, "mg"), replacement: "" } ]
    }))
    .pipe(clipEmptyFiles())
    .pipe(debug({title: "Syntax Error found in: "}))
    .pipe(gulp.dest(`${argv.channel}/.errorcheck-${argv.locale}`))
    .pipe(concatFilenames(`${argv.channel}/inc-filelist`));
});

/**
 * check generated ja/ja-JP-mac *.ini files
 * @param {string} channel - target channel (release|beta|aurora|nightly)
 * @param {string} local   - target locale (ja|ja-JP-mac)
 */
gulp.task("errorcheck-ini", () => {
  const argv = minimist(process.argv.slice(2), {
    string: ["channel", "locale"],
    default: {
      channel: config.channel,
      locale: "ja",
    }
  });
  const INI_COMMENT = `[;#][^\\n]*`;
  const INI_ENTITY = `([^=\\n]+)=([^\\n]*)`;
  // white spaces, comments and [Strings] (this header is not optional)
  const INI_HEADER = `^\\s*(${INI_COMMENT}\\n\\s*)*\\[[^\\]]+\\]\\n`;
  //                          <-- $1 = pre white space
  // # pre comment            <-- $2 = pre comment
  // entitykey=entityvalue    <-- $3 = definition
  // <--$4---> <---$5---->        $4 = key, $5 = value
  const INI_BLOCK = `^(\\s*)((?:^${INI_COMMENT}\\n(?:[ \\t]*\\n)*)*)(${INI_ENTITY})$\\n?`;
  const INI_FOOTER = `\\s+$`;
  
  gulp.src(`${argv.channel}/${argv.locale}/**/*.ini`)
    .pipe(replace({
      patterns: [
        { match: new RegExp(INI_HEADER), replacement: "" },
        { match: new RegExp(INI_FOOTER), replacement: "" }
      ]
    }))
    .pipe(replace({
      patterns: [ { match: new RegExp(INI_BLOCK, "mg"), replacement: "" } ]
    }))
    .pipe(clipEmptyFiles())
    .pipe(debug({title: "Syntax Error found in: "}))
    .pipe(gulp.dest(`${argv.channel}/.errorcheck-${argv.locale}`))
    .pipe(concatFilenames(`${argv.channel}/ini-filelist`));
});

/**
 * run all error check tasks in parallel
 */
gulp.task("errorcheck", ["errorcheck-properties", "errorcheck-dtd", "errorcheck-inc", "errorcheck-ini"], () => { /* nothing */ });


/**
 * check place holders in ja/ja-JP-mac properties files
 */
gulp.task("placeholdercheck", () => {
  console.log("not implemented yet");
});

/**
 * check plural form usage in ja/ja-JP-mac properties files
 */
gulp.task("pluralcheck", () => {
  console.log("not implemented yet");
});

/**
 * check word/string usage in ja/ja-JP-mac files
 */
gulp.task("wordcheck", () => {
  console.log("not implemented yet");
});


gulp.task("test", () => {
  console.log(status);

  /*
  var jsonUrl = "https://gist.githubusercontent.com/dynamis/1e6252ef7541ffbdb943/raw/41c5d92454dc89709d791ddfa773673eb97aface/languages.json";
  request({url: jsonUrl, json: true}, (error, res, json) => {
    if (error) throw error;
    console.log(json);
  });
  */
});
