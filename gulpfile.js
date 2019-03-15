
const del = require('del');
const gulp = require('gulp');
const sourcemaps = require('gulp-sourcemaps');
const plumber = require('gulp-plumber');
const notify = require('gulp-notify');
const rename = require('gulp-rename');
const order = require('gulp-order');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify');

var targetName = 'ganttchart';

var mainJsSrc = [ 'src/main/js/**/*.js' ];
var mainCssSrc = [ 'src/main/js/**/*.css' ];

var build = 'lib';

gulp.task('clean', function() {
  return del([ `${build}/*` ]);
});

gulp.task('concat-main-js', function() {
  return gulp.src(mainJsSrc)
    .pipe(sourcemaps.init() )
    .pipe(order([ '**/*.js' ]) )
    .pipe(concat(`${targetName}.js`) )
    .pipe(sourcemaps.write('.') )
    .pipe(gulp.dest(build) );
});

gulp.task('concat-main-css', function() {
  return gulp.src(mainCssSrc)
    .pipe(order([ '**/*.css' ]) )
    .pipe(concat(`${targetName}.css`) )
    .pipe(gulp.dest(`${build}/`) );
});

gulp.task('compress-main', gulp.series('concat-main-js', function() {
  return gulp.src(`${build}/${targetName}.js`)
    .pipe(uglify({ output : { ascii_only : true } }) )
    .pipe(rename({ suffix: '.min' }) )
    .pipe(gulp.dest(`${build}/`) );
}) );

gulp.task('build', gulp.series('compress-main', 'concat-main-css') );

gulp.task('watch', function() {
  var src = mainJsSrc.concat(mainCssSrc);
  gulp.watch(src, gulp.series('build') )
    .on('change', function(path) {
      console.log(path);
    });
});

gulp.task('default', gulp.series('clean', 'build') );
