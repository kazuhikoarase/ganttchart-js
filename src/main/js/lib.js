//
// gantt-lib
// @author Kazuhiko Arase
// Licensed under MIT LICENSE
//

'use strict';

!function(prlib) {

  var classNamePrefix = 'pr';

  var util = function() {

    var parseArguments = function(args) {
      var children = [];
      var opts = {};
      for (var i = 1; i < args.length; i += 1) {
        var a = args[i];
        if (typeof a == 'object') {
          if (typeof a.splice == 'function') {
            children = a;
          } else {
            opts = a;
          }
        }
      }
      return { children : children, opts : opts };
    }

    var classNamePrefixRe = /\$\{prefix\}/g;
    var replaceClassNamePrefix = function(className) {
      return className.replace(classNamePrefixRe, classNamePrefix);
    };

    var wideNumChars = '０１２３４５６７８９＋－．，／';
    var narrowNumChars = '0123456789+-.,/';
    if (wideNumChars.length != narrowNumChars.length) {
      throw wideNumChars + ',' + narrowNumChars;
    }

    var $ = function(elm) {
      this.elm = elm;
    };
    $.prototype = {
      on : function(type, listener) {
        this.elm.addEventListener(type, listener);
        return this;
      },
      off : function(type, listener) {
        this.elm.removeEventListener(type, listener);
        return this;
      },
      addClass : function(className, remove) {
        className = replaceClassNamePrefix(className);
        var classes = '';
        (this.elm.getAttribute('class') || '').split(/\s+/g).
          forEach(function(c) {
            if (c != className) {
              classes += ' ' + c;
              return;
            }
          } );
        if (!remove) {
          classes += ' ' + className;
        }
        elm.setAttribute('class', classes);
        return this;
      },
      removeClass : function(className) {
        return this.addClass(className, true);
      }
    };

    return {

        extend : function() {
          var o = arguments[0];
          for (var i = 1; i < arguments.length; i += 1) {
            var a = arguments[i];
            for (var k in a) {
              o[k] = a[k];
            }
          }
          return o;
        },

        callLater : function(cb) {
          window.setTimeout(cb, 0);
        },

        set : function(elm, opts) {
          if (opts.attrs) {
            for (var k in opts.attrs) {
              var v = opts.attrs[k];
              var t = typeof v;
              if (t == 'number' || t == 'boolean') {
                v = '' + v;
              } else if (t == 'undefined') {
                v = '';
              }
              if (typeof v != 'string') {
                throw 'bad attr type for ' + k + ':' + (typeof v);
              }
              if (k == 'class') {
                v = replaceClassNamePrefix(v);
              }
              elm.setAttribute(k, v);
            }
          }
          if (opts.props) {
            for (var k in opts.props) {
              elm[k] = opts.props[k];
            }
          }
          if (opts.style) {
            for (var k in opts.style) {
              elm.style[k] = opts.style[k] || '';
            }
          }
          if (opts.on) {
            for (var k in opts.on) {
              elm.addEventListener(k, opts.on[k]);
            }
          }
          return elm;
        },

        createElement : function(tagName) {
          var args = parseArguments(arguments);
          var elm = document.createElement(tagName);
          args.children.forEach(function(child) { elm.appendChild(child); });
          return this.set(elm, args.opts);
        },

        createSVGElement : function(tagName) {
          var args = parseArguments(arguments);
          var elm = document.createElementNS('http://www.w3.org/2000/svg', tagName);
          args.children.forEach(function(child) { elm.appendChild(child); });
          return this.set(elm, args.opts);
        },

        $ : function(elm) { return new $(elm); },

        closest : function(elm, opts) {
          if (typeof opts.className == 'string') {
            opts.className = replaceClassNamePrefix(opts.className);
          }
          while (elm != null && elm.nodeType == 1 && elm != opts.root) {
            if (typeof opts.tagName == 'string' && elm.tagName == opts.tagName) {
              return elm;
            } else if (typeof opts.$el == 'object' && elm == opts.$el) {
              return elm;
            } else if (typeof opts.className == 'string' &&
                (elm.getAttribute('class') || '').split(/\s+/g).indexOf(opts.className)!= -1) {
              return elm;
            }
            elm = elm.parentNode;
          }
          return null;
        },

        indexOf : function(elm) {
          if (elm == null) {
            return -1;
          }
          return Array.prototype.indexOf.call(elm.parentNode.childNodes, elm);
        },

        offset : function(elm) {
          var off = { left : 0, top : 0 };
          var e;
          var base = null;
          for (e = elm; e.parentNode != null; e = e.parentNode) {
            if (e.offsetParent != null) {
              base = e;
              break;
            }
          }
          if (base != null) {
            for (e = base; e.offsetParent != null; e = e.offsetParent) {
              off.left += e.offsetLeft;
              off.top += e.offsetTop;
            }
          }
          for (e = elm; e.parentNode != null &&
                e != document.body; e = e.parentNode) {
            off.left -= e.scrollLeft;
            off.top -= e.scrollTop;
          }
          return off;
        },

        moveSublist : function(list, from, length, to) {
          var i1 = list.slice(from, from + length);
          var i2 = list.slice(0, from).concat(list.slice(from + length) );
          to = from < to? to - length : to;
          return i2.slice(0, to).concat(i1).concat(i2.slice(to) );
        },

        getCellId : function(row, col) {
          return row + ':' + col;
        },

        translate : function(val1, min1, max1, min2, max2, log) {
          var val2 = (val1 - min1) * (max2 - min2) / (max1 - min1) + min2;
          return Math.max(min2, Math.min(Math.round(val2), max2) );
        },

        trimRe : /^[\s\u3000]+|[\s\u3000]+$/g,
        trim : function(value) {
          return value.replace(this.trimRe, '');
        },

        rtrimRe : /[\s\u3000]+$/g,
        rtrim : function(value) {
          return value.replace(this.rtrimRe, '');
        },

        format : function(msg) {
          for (var i = 1; i < arguments.length; i += 1) {
            msg = msg.replace(new RegExp('\\{' +
                (i - 1) + '\\}'), '' + arguments[i]);
          }
          return msg;
        },

        // num utils

        numRe : /^([\+\-]?)([0-9]*)(\.[0-9]*)?$/,

        formatNumber : function(value, digits, s1, s2) {
          digits = digits || 0;
          s1 = typeof s1 == 'string'? s1 : ',';
          s2 = typeof s2 == 'string'? s2 : '.';
          if (typeof value == 'number') {
            value = '' + value;
          }
          if (typeof value != 'string') {
            return '';
          }
          var mat = value.match(this.numRe);
          if (mat) {
            if (mat[2].length == 0 && (!mat[3] || mat[3].length == 1) ) {
              return '';
            }
            var iPart = mat[2].length > 0? mat[2] : '0';
            while (iPart.length > 1 && iPart.charAt(0) == '0') {
              iPart = iPart.substring(1);
            }
            var neg = mat[1] == '-';
            var s = '';
            while (iPart.length > 3) {
              s = s1 + iPart.substring(iPart.length - 3) + s;
              iPart = iPart.substring(0, iPart.length - 3);
            }
            s = iPart + s;
            if (digits > 0) {
              var fPart = mat[3] || s2;
              s += s2;
              for (var i = 0; i < digits; i += 1) {
                s += (i + 1 < fPart.length)? fPart[i + 1] : '0';
              }
            }
            return (neg && s != '0')? '-' + s : s;
          }
          return value;
        },

        toNarrowNumber : function(value) {
          var s = '';
          for (var i = 0; i < value.length; i += 1) {
            var c = value.charAt(i);
            var index = wideNumChars.indexOf(c);
            s += (index != -1)? narrowNumChars.charAt(index) : c;
          }
          return s;
        },

        fillLeftZero : function(s, digits) {
          while (s.length < digits) { s = '0' + s; }
          return s;
        },

        formatYM : function(year, month) {
          return year + '/' + (month + 1);
        },
        /**
         * format string(8)
         */
        formatDate : function(date) {
          if (typeof date == 'string' && date.match(/^\d{8}$/) ) {
            return date.substring(0, 4) +
              '/' + date.substring(4, 6) +
              '/' + date.substring(6, 8);
          } else {
            return '';
          }
        },
        /**
         * parse into string(8)
         */
        dateRe : /^(\d{4})\D(\d{1,2})\D(\d{1,2})$/,
        parseDate : function(value) {
          if (typeof value == 'number') {
            value = '' + value;
          }
          if (typeof value == 'string') {
            var mat = value.match(this.dateRe);
            if (mat) {
              value = new Date(+mat[1], +mat[2] - 1, +mat[3]);
            } else {
              return value;
            }
          }
          return this.fillLeftZero('' + value.getFullYear(), 4) +
              this.fillLeftZero('' + (value.getMonth() + 1), 2) +
              this.fillLeftZero('' + value.getDate(), 2);
        },
        strToDate : function(date) {
          return new Date(
              +date.substring(0, 4),
              +date.substring(4, 6) - 1,
              +date.substring(6, 8) );
        },
        min : function(a, b) { return a < b? a : b; },
        max : function(a, b) { return a > b? a : b; }

      };
  }();

  var sumOf = function(fn, from, to) {
    var sum = 0;
    for (var i = from; i < to; i += 1) {
      sum += fn(i);
    }
    return sum;
  };

  var sumArr = function(a) {
    return a.map(function(v, p) {
      for (var i = 0; i < p; i += 1) {
        v += a[i];
      }
      return v;
    });
  };

  var createSpanMap = function() {
    var spaned = {};
    return {
      setSpaned : function(row, col, cell) {
        for (var r = 0; r < cell.rowSpan; r += 1) {
          for (var c = 0; c < cell.colSpan; c += 1) {
            if (r == 0 && c == 0) {
              // nothing for cell itself.
            } else {
              spaned[util.getCellId(row + r, c + col)] = 1;
            }
          }
        }
      },
      isSpaned : function(row, col) {
        return spaned[util.getCellId(row, col)];
      }
    };
  };

  var getOrCrt = function(tagName, index, parent, init) {
    if (parent.children && index < parent.children.length) {
      return parent.children[index];
    }
    if (!parent.children) {
      parent.children = [];
    }
    var elm = { $el : document.createElement(tagName) };
    if (init) {
      init(elm);
    }
    parent.$el.appendChild(elm.$el);
    parent.children.push(elm);
    return elm;
  };

  var createEventTarget = function() {
    var map = {};
    var listeners = function(type) {
      return map[type] || (map[type] = []);
    };
    return {
      trigger : function(type, detail) {
        var ctx = this;
        listeners(type).forEach(function(listener) {
          listener.call(ctx, { type : type }, detail);
        });
        return this;
      },
      on : function(type, listener) {
        listeners(type).push(listener);
        return this;
      },
      off : function(type, listener) {
        map[type] = listeners(type).filter(function(l) {
          return listener != l;
        });
        return this;
      }
    };
  };

  var createUIEventTarget = function() {
    var valid = true;
    return util.extend(createEventTarget(), {
      invalidate : function() {
        valid = false;
        util.callLater(function() {
          if (!this.valid) {
            valid = true;
            this.render();
          }
        }.bind(this) );
      },
      render : function() {
      }
    });
  }

  var createDateOptions = function(cell, textField) {

    var range = function(size) {
      var a = [];
      for (var i = 0; i < size; i += 1) {
        a.push(i);
      }
      return a;
    };

    var cs = window.getComputedStyle(textField, null);
    var fontStyle = { fontFamily : cs.fontFamily, fontSize : cs.fontSize };
    var dayNames = i18n.getInstance().messages.DAY_NAMES.split(/,/g);

    var createButton = function(next, action) {
      var style = { position : 'absolute', top : '0px' };
      var transform;
      if (next) {
        style.right = '0px';
        transform = 'translate(0 0)';
      } else {
        style.left = '0px';
        transform = 'rotate(180) translate(-16 -16)';
      }
      return util.createSVGElement('svg', {
        attrs : { width : '16', height : '16' },
        style : style,
        on : { click : function(event) {
          action();
        }}
      }, [
        util.createSVGElement('rect', {
          attrs : { 'class' : '${prefix}-cal-button',
            x : '1', y : '1', width : '14', height : '14' } }),
        util.createSVGElement('path', {
          attrs : { 'class' : '${prefix}-cal-button-arrow',
            d : 'M4 2L12 8L4 14', transform : transform },
          style : { pointerEvents : 'none' } })
      ]);
    };

    var calHead = util.createElement('div', {
        style : { position : 'relative' } }, [
      util.createElement('div', {
        style : util.extend({ textAlign : 'center',
          paddingLeft : '16px', paddingRight : '16px' }, fontStyle),
        props : { textContent : 'title'},
        on : { click : function() {
          model.displayDate = new Date(
              model.today.getFullYear(),
              model.today.getMonth(), 1);
          render();
        } } }),
      createButton(false, function() {
        model.displayDate = new Date(
            model.displayDate.getFullYear(),
            model.displayDate.getMonth() - 1, 1);
        render();
      }),
      createButton(true, function() {
        model.displayDate = new Date(
            model.displayDate.getFullYear(),
            model.displayDate.getMonth() + 1, 1);
        render();
      })
    ]);

    var calBody = util.createElement('table',
        { attrs : { cellSpacing : '0' } }, [
      util.createElement('thead', [
        util.createElement('tr', range(7).map(function(i) {
        return util.createElement('th',
            { props : { textContent : dayNames[i] }, style : fontStyle });
      }) ) ] ),
      util.createElement('tbody', range(6).map(function() {
        return util.createElement('tr', range(7).map(function() {
          return util.createElement('td', { style : fontStyle });
        }) );
      }) )
    ]);

    var frame = util.createElement('div', {
      attrs : { 'class': '${prefix}-calendar' },
      style : { position : 'absolute' },
      on : {
        mousedown : function(event) {
          if (event.which != 1) {
            return;
          }
          event.preventDefault();
          var td = util.closest(event.target, { tagName : 'TD' });
          if (td != null) {
            var tdIndex = util.indexOf(td);
            var trIndex = util.indexOf(td.parentNode);
            var date = new Date(model.displayDate.getFullYear(),
                model.displayDate.getMonth(),
                model.displayDate.getDate() - model.displayDate.getDay() +
                trIndex * 7 + tdIndex);
            setSelectedDate(date);
            setVisible(false);
          }
        }
      }
    }, [ calHead, calBody ]);

    var model = {
      today : function() {
        var today = new Date();
        return new Date(
            today.getFullYear(), today.getMonth(), today.getDate() );
      }(),
      selectedDate : null,
      displayDate : null,
      visible : true
    };

    !function() {
      if (typeof cell.value == 'string' && cell.value.match(/^\d{8}$/) ) {
        model.selectedDate = util.strToDate(cell.value);
      } else {
        model.selectedDate = null;
      }
    }();

    var setSelectedDate = function(date) {
      model.selectedDate = date;
      scrollIntoView(model.selectedDate);
      var value = model.selectedDate? util.parseDate(model.selectedDate) : '';
      var label = value? util.formatDate(value) : '';
      options.trigger('valuechange', { value : value, label : label });
    };

    var setVisible = function(visible) {
      model.visible = visible;
      options.$el.style.display = visible? '' : 'none';
    };

    var scrollIntoView = function(date) {
      date = date || model.today;
      model.displayDate = new Date(date.getFullYear(), date.getMonth(), 1);
      render();
    };

    var render = function() {
      var displayDate = model.displayDate;
      var d = 0;
      calHead.firstChild.textContent = util.formatYM(
          displayDate.getFullYear(),
          displayDate.getMonth() );
      var tbody = calBody.childNodes[1];
      for (var row = 0; row < 6; row += 1) {
        for (var col = 0; col < 7; col += 1) {
          var date = new Date(
              displayDate.getFullYear(),
              displayDate.getMonth(),
              displayDate.getDate() - displayDate.getDay() + d);
          var className = '';
          if (date.getFullYear() == displayDate.getFullYear() &&
              date.getMonth() == displayDate.getMonth() ) {
            className += ' ${prefix}-current-month';
          }
          if (model.selectedDate &&
              model.selectedDate.getTime() == date.getTime() ) {
            className += ' ${prefix}-selected-date';
          }
          if (model.today.getTime() == date.getTime() ) {
            className += ' ${prefix}-today';
          }
          util.set(tbody.childNodes[row].childNodes[col], {
            attrs : { 'class' : className },
            props : { textContent : '' + date.getDate() }
          });
          d += 1;
        }
      }
    }

    var rollDate = function(offset) {
      setVisible(true);
      if (model.selectedDate) {
        setSelectedDate(new Date(
            model.selectedDate.getFullYear(),
            model.selectedDate.getMonth(),
            model.selectedDate.getDate() + offset) );
      } else {
        setSelectedDate(model.today);
      }
    };

    scrollIntoView(model.selectedDate);

    var keydownHandler = function(event) {

      switch(event.keyCode) {
/*
      case 37: // Left
        event.preventDefault();
        event.stopPropagation();
        rollDate(-1);
        break;
*/
      case 38: // Up
        event.preventDefault();
        event.stopPropagation();
        //rollDate(-7);
        rollDate(-1);
        break;
/*
      case 39: // Right
        event.preventDefault();
        event.stopPropagation();
        rollDate(1);
        break;
*/
      case 40: // Down
        event.preventDefault();
        event.stopPropagation();
        //rollDate(7);
        rollDate(1);
        break;

      case 27: // Esc
        event.preventDefault();
        event.stopPropagation();
        setVisible(false);
        break;
      }
    };

    var mousedownHandler = function(event) {
      if (event.which != 1) {
        return;
      }
      // toggle visible
      setVisible(!model.visible);
    };

    util.$(textField).
      on('keydown', keydownHandler).
      on('mousedown', mousedownHandler);

    var options = util.extend(createEventTarget(), {
      $el : frame,
      dispose : function() {
        util.$(textField).
          off('keydown', keydownHandler).
          off('mousedown', mousedownHandler);
      }
    });

    return options;
  };

  var createSelectOptions = function(cell, textField) {

    var width = 100;
    var height = 100;

    var cs = window.getComputedStyle(textField, null);
    var vScr = createScr('v');
    var view = util.createElement('div', {
      style : { position : 'absolute', overflow : 'hidden' }
    });
    var frame = util.createElement('div', {
      attrs : { 'class': '${prefix}-select' },
      style : { position : 'absolute',
        width : width + 'px', height : height + 'px',
        fontFamily : cs.fontFamily, fontSize : cs.fontSize
      },
      on : {
        mousedown : function(event) {
          event.preventDefault();
          var item = util.closest(event.target,
              { className : '${prefix}-select-option' });
          if (item) {
            setSelectedIndex(model.items.children[util.indexOf(item)].index);
            setVisible(false);
          }
        },
        wheel : function(event) {
          event.preventDefault();
          vScr.scrollTop += event.deltaY;
        }
      }
    }, [ view, vScr ]);

    util.set(vScr, {
      on : {
        scroll : function() {
          render();
        }
      }
    });

    // append to measure.
    document.body.appendChild(frame);
    var itemHeight = function(target) {
      var tmpItem = util.createElement('div');
      tmpItem.textContent = '＠';
      target.appendChild(tmpItem);
      try {
        return tmpItem.offsetHeight;
      } finally {
        target.removeChild(tmpItem);
      }
    }(view);
    var scrSize = measureScrSize(frame);
    // end measure
    document.body.removeChild(frame);

    var model = {
      options : null,
      indexByValue : null,
      selectedIndex : -1,
      items : { $el : view },
      visible : true,
      getIndexByValue : function(value) {
        if (!this.indexByValue) {
          var indexByValue = {};
          this.options.forEach(function(option, i) {
            indexByValue[option.value] = i;
          });
          this.indexByValue = indexByValue;
        }
        var index = this.indexByValue[value];
        return typeof index == 'number'? index : -1;
      },
      lastValue : textField.value
    };

    var setOptions = function(options) {
      model.options = options;
      model.indexByValue = null;
      model.selectedIndex = -1;
    };
    var getDefaultOptions = function() {
      return cell.options? cell.options() : [];
    };

    var setSelectedIndex = function(selectedIndex) {
      if (0 <= selectedIndex && selectedIndex < model.options.length) {
        model.selectedIndex = selectedIndex;
        scrollIntoView(model.selectedIndex);
        options.trigger('valuechange', model.options[selectedIndex]);
      } else {
        model.selectedIndex = -1;
        options.trigger('valuechange', { label : textField.value });
      }
    };

    var setVisible = function(visible) {
      model.visible = visible;
      options.$el.style.display = model.visible? '' : 'none';
    };

    var scrollIntoView = function(index) {
      var minIndex = Math.ceil(vScr.scrollTop / itemHeight);
      var maxIndex = Math.floor( (vScr.scrollTop + height) / itemHeight) - 1;
      var offsetTop = 0;
      while (index < minIndex && 0 < minIndex) {
        offsetTop -= itemHeight;
        minIndex -= 1;
      }
      while (index > maxIndex && maxIndex < model.options.length - 1) {
        offsetTop += itemHeight;
        maxIndex += 1;
      }
      vScr.scrollTop += offsetTop;
      render();
    };

    var render = function() {

      util.set(view, { style : {
        left : '0px', top : '0px',
        width : (width - scrSize.width) + 'px', height : height + 'px' } });
      util.set(vScr, { style : {
        left : (width - scrSize.width) + 'px', top : '0px',
        width : scrSize.width + 'px', height : height + 'px' } });
      util.set(vScr.firstChild, { style : {
        height : itemHeight * model.options.length + 'px' } });

      var top = -vScr.scrollTop % itemHeight;
      var index = Math.floor(vScr.scrollTop / itemHeight);
      var itemIndex = 0;

      view.scrollTop = -top;

      while (top < height) {

        var item = getOrCrt('div', itemIndex, model.items, function(item) {
          util.set(item.$el, {
            style : { overflow : 'hidden', whiteSpace : 'nowrap' }
          });
        });

        item.index = index;
        item.option = model.options[index] || { label : '' };

        var className = '${prefix}-select-option';
        if (index == model.selectedIndex) {
          className += ' ${prefix}-select-option-selected';
        }
        util.set(item.$el, {
          attrs : { 'class' : className },
          props : { textContent : item.option.label || '\u00a0' },
          style : { height : itemHeight + 'px' }
        });

        index += 1;
        itemIndex += 1;
        top += itemHeight;
      }
    };

    var keydownHandler = function(event) {

      switch(event.keyCode) {

      case 38: // Up
        event.preventDefault();
        event.stopPropagation();
        setVisible(true);
        setSelectedIndex(model.selectedIndex - 1);
        break;

      case 40: // Down
        event.preventDefault();
        event.stopPropagation();
        setVisible(true);
        setSelectedIndex(model.selectedIndex + 1);
        break;

      case 27: // Esc
        event.preventDefault();
        event.stopPropagation();
        setVisible(false);
        break;
      }
    };

    var keyupHandler = function(event) {
      switch(event.keyCode) {
      case 37: // Left
      case 38: // Up
      case 39: // Right
      case 40: // Down
        break;
      default :
        if (model.lastValue != textField.value) {
          model.lastValue = textField.value;
          var value = textField.value.toUpperCase();
          var options = [];
          getDefaultOptions().forEach(function(option, i) {
            if (option.label.toUpperCase().indexOf(value) != -1) {
              options.push(option);
            }
          });
          setOptions(options);
          render();
        }
        break;
      }
    };

    var mousedownHandler = function(event) {
      if (event.which != 1) {
        return;
      }
      // toggle visible
      setVisible(!model.visible);
    };

    util.$(textField).
      on('keydown', keydownHandler).
      on('keyup', keyupHandler).
      on('mousedown', mousedownHandler);

    var options = util.extend(createEventTarget(), {
      $el : frame,
      dispose : function() {
        util.$(textField).
          off('keydown', keydownHandler).
          off('keyup', keyupHandler).
          off('mousedown', mousedownHandler);
      }
    });

    setOptions(getDefaultOptions() );
    model.selectedIndex = model.getIndexByValue(cell.value);
    util.callLater(function() {
      scrollIntoView(model.selectedIndex);
    });

    return options;
  };

  var defaultCellRendererFactory = function(td) {

    var label = util.createElement('span');
    td.$el.appendChild(label);

    var textField = null;
    var options = null;

    // label value cache.
    var labelValue = null;

    var getLabelValue = function(cell, value) {
      if (cell.dataType == 'number') {
        return util.formatNumber(util.toNarrowNumber(value),
            cell.decimalDigits || 0);
      } else if (cell.dataType == 'date') {
        return util.formatDate(value);
      } else if (cell.dataType == 'select-one') {
      }
      if (cell.labelFunction) {
        return cell.labelFunction(value);
      }
      return value;
    };

    var getEditorValue = function(cell, value) {
      if (typeof value == 'undefined' || value === null) {
        return '';
      }
      if (cell.dataType == 'number') {
      } else if (cell.dataType == 'date') {
        return getLabelValue(cell, value);
      } else if (cell.dataType == 'select-one') {
        return getLabelValue(cell, value);
      }
      return value;
    };

    var getValue = function(cell, value) {

      if (cell.dataType == 'number') {
        value = util.toNarrowNumber(value);
        if (value.length == 0) {
          return value;
        } else if (value.match(util.numRe) ) {
          return util.formatNumber(value, cell.decimalDigits || 0, '');
        } else {
          return cell.value;
        }
      } else if (cell.dataType == 'date') {
        value = util.toNarrowNumber(value);
        if (value.length == 0) {
          return value;
        } else if (value.match(util.dateRe) ) {
          return util.parseDate(value);
        } else {
          return cell.value;
        }
      } else if (cell.dataType == 'select-one') {
        if (options.selected) {
          if (typeof options.selected.value == 'undefined') {
            if (cell.allowAnonymousOption) {
              return options.selected.label;
            }
          } else {
            return options.selected.value;
          }
        }
        return cell.value;
      }

      return value;
    };

    return {

      render : function(cell) {
        var value = getLabelValue(cell, cell.value);
        if (labelValue !== value) {
          label.textContent = value || '\u00a0';
          labelValue = value;
        }
      },

      beginEdit : function(cell) {

        console.log('beginEdit', cell);

        if (textField == null) {
          var cs = window.getComputedStyle(td.$el, null);
          textField = util.createElement('input', {
            attrs : { type : 'text' },
            style : {
              width : '100%', height : '100%',
              border : 'none', outline : 'none',
              backgroundColor : 'transparent',
              fontFamily : cs.fontFamily,
              fontSize : cs.fontSize,
              textAlign : cs.textAlign
            } });
          td.$el.appendChild(textField);
        }

        if (options == null) {
          if (cell.dataType == 'date') {
            options = createDateOptions(cell, textField).
              on('valuechange', function(event, detail) {
                textField.value = detail.label;
                textField.select();
                options.selected = detail;
              });
            document.body.appendChild(options.$el);
          } else if (cell.dataType == 'select-one') {
            options = createSelectOptions(cell, textField).
              on('valuechange', function(event, detail) {
                if (typeof detail.value != 'undefined') {
                  textField.value = detail.label;
                  textField.select();
                }
                options.selected = detail;
              });
            document.body.appendChild(options.$el);
          }
        }

        if (options) {
          var off = util.offset(td.$el);
          options.$el.style.left = (off.left) +'px';
          options.$el.style.top = (off.top + td.$el.offsetHeight) +'px';
        }

        label.style.display = 'none';
        textField.style.display = '';
        textField.value = getEditorValue(cell, cell.value);
        textField.focus();
        textField.select();

        return {
          endEdit : function() {

            console.log('endEdit', cell);

            var value = getValue(cell, util.rtrim(textField.value) );

            if (options != null) {
              document.body.removeChild(options.$el);
              options.dispose();
              options = null;
            }
            label.style.display = '';
            textField.style.display = 'none';

            return { newValue : value, oldValue : cell.value };
          }
        };
      },
      dispose : function() {
        if (textField != null) {
          td.$el.removeChild(textField);
          textField = null;
        }
      }
    };
  };

  var createInnerTableModel = function() {
    return util.extend(createEventTarget(), {
      maxRowSpan : 10,
      maxColSpan : 10,
      getRowCount : function() { return 10000; },
      getColumnCount : function() { return 10000; },
      getCellWidthAt : function(col) { return 50; },
      getCellHeightAt : function(row) { return 20; },
      getCellAt : function(row, col, hint) {
        return { value : row + ',' + col, colSpan : 1, rowSpan : 1 };
      }
    });
  };

  var createTableModel = function() {
    return util.extend(createInnerTableModel(), {
      getContentWidth : function() { return 345; },
      getNumColumns : function() { return [ 1, 2, 10000 ]; },
      getNumRows : function() { return [ 3, 5000, 4 ]; },
      getRowCount : function() {
        var rowCount = 0;
        this.getNumRows().forEach(function(numRow) {
          rowCount += numRow;
        });
        return rowCount;
      },
      getColumnCount : function() {
        var columnCount = 0;
        this.getNumColumns().forEach(function(numColumn) {
          columnCount += numColumn;
        });
        return columnCount;
      }
    });
  };

  var createScr = function(orientation) {
    var style = { position : 'absolute',
        left : '0px', top : '0px',
        width : '0px', height : '0px' };
    if (orientation == 'h') {
      style.overflowX = 'scroll';
      style.overflowY = 'hidden';
    } else if (orientation == 'v') {
      style.overflowX = 'hidden';
      style.overflowY = 'scroll';
    } else {
      style.overflow = 'scroll';
    }
    return util.createElement('div', { style : style },
      [ util.createElement('div', {
        style : { position : 'absolute', left : '0px', top : '0px',
          width : '1px', height : '1px' }
      }) ]);
  };

  var measureScrSize = function(target) {
    var tmpScr = createScr();
    tmpScr.style.width =
      tmpScr.style.height = '50px';
    tmpScr.firstChild.style.width =
      tmpScr.firstChild.style.height = '100px';
    target.appendChild(tmpScr);
    try {
      return {
        width : tmpScr.offsetWidth - tmpScr.clientWidth,
        height : tmpScr.offsetHeight - tmpScr.clientHeight
      };
    } finally {
      target.removeChild(tmpScr);
    }
  };

  var createBar = function(className, style) {
    return util.createElement('div', {
      attrs : { 'class' : className },
      style : { position : 'absolute',
        left : '0px', top : '0px', width : '0px', height : '0px' } });
  };

  var createResizeHandle = function(className, style) {

    var backgroundColor = 'rgba(0,0,255,0)';

    var mousedownHandler = function(event) {

      var mousemoveHandler = function(event) {
        deltaX = event.pageX - dragX;
        bar.style.left = (deltaX - 1) + 'px';
      };

      var mouseupHandler = function(event) {
        util.$(document).
          off('mousemove', mousemoveHandler).
          off('mouseup', mouseupHandler);
        document.body.removeChild(block);
        bar.style.display = 'none';
        body.trigger('move', { deltaX : deltaX });
      };

      event.preventDefault();

      var dragX = event.pageX;
      var deltaX = 0;

      util.$(document).
        on('mousemove', mousemoveHandler).
        on('mouseup', mouseupHandler);

      var block = util.createElement('div',
        { style : { position : 'absolute',
          cursor : 'ew-resize', backgroundColor : backgroundColor,
          left : document.documentElement.scrollLeft + 'px',
          top : document.documentElement.scrollTop + 'px',
          width : window.innerWidth + 'px',
          height : window.innerHeight  + 'px'
        } });
      document.body.appendChild(block);
      bar.style.left = '-1px';
      bar.style.height = body.barHeight + 'px';
      bar.style.display = '';
    };

    var bar = util.createElement('div', {
      attrs : { 'class' : '${prefix}-resize-bar' },
      style : { position : 'absolute', display : 'none',
        left : '-1px', top : '0px', width : '0px', height : '100px' }
      });

    var handle = util.createElement('div', {
        style : { position : 'absolute', 
          left : '-3px', top : '0px', width : '5px', height : '100%',
          cursor : 'ew-resize', backgroundColor : backgroundColor },
        on : { mousedown : mousedownHandler }
      });
    var body = util.extend(createEventTarget(), {
      $el : util.createElement('div', {
          style : { position : 'absolute', overflow : 'visible',
            left : '0px', top : '0px', width : '0px', height : '0px' }
        }, [ bar, handle ]),
      barHeight : 100
    });
    return body;
  };

  var createTable = function(tableModel) {

    var tables = [];
    !function() {
      for (var i = 0; i < 9; i += 1) {
        tables.push(createInnerTable() );
      }
    }();
    tables.forEach(function(table, t) {

      table.model = tableModel;
      table.tblCol = t % 3;
      table.tblRow = ~~(t / 3);

      util.$(table.$el).on('wheel', function(event) {
        event.preventDefault();
        if (table.tblCol == 1) {
          hScr1.scrollLeft += event.deltaX;
        } else if (table.tblCol == 2) {
          hScr2.scrollLeft += event.deltaX;
        }
        if (table.tblRow == 1) {
          vScr1.scrollTop += event.deltaY;
        }
      });
    });

    var hScr1 = createScr('h');
    var hScr2 = createScr('h');
    var vScr1 = createScr('v');

    [ hScr1, hScr2, vScr1 ].forEach(function(scr) {
      util.set(scr, { on : {
        scroll : function(event) {
          table.render();
        }
      } });
    });

    var hBar1 = createBar('${prefix}-h-bar');
    var hBar2 = createBar('${prefix}-h-bar');
    var vBar1 = createBar('${prefix}-v-bar');
    var vBar2 = createBar('${prefix}-v-bar');

    var vSplitHandle = createResizeHandle().
        on('move', function(event, detail) {
      table.model.trigger('contentwidthchange', detail);
    });

    var columnResizeHandles = [];

    var listenerWrapper = function(listener) {
      return function(event) {
        var td = util.closest(event.target, { tagName : 'TD' });
        if (td) {
          var tr = td.parentNode;
          var tbody = tr.parentNode;
          var tdIndex = util.indexOf(td);
          var trIndex = util.indexOf(tr);
          td = null;
          tables.forEach(function(table) {
            if (table.tbody.$el == tbody) {
              td = table.tbody.children[trIndex].children[tdIndex];
            }
          });
          table.trigger(event.type, { originalEvent : event,
            row : td.row, col : td.col });
        }
        listener(event, td);
      };
      
    };
    var frame = util.createElement('div', {
      style : { position : 'relative', overflow : 'hidden' },
      on : {
        click : listenerWrapper(function(event, td) {
          if (td == null) {
            return;
          }
        }),
        mousedown : listenerWrapper(function(event, td) {
          if (td == null) {
            editor.endEdit();
            return;
          }
          if (event.which != 1) {
            return;
          }
          if (!editor.cell ||
              editor.cell.row != td.row ||
              editor.cell.col != td.col) {
            if (editor.isEditableAt(td.row, td.col) ) {
              event.preventDefault();
              editor.beginEdit(td.row, td.col, true);
            }
          } else if (editor.cell) {
            editor.editing = true;
          }
        }),
        focusout : function(event) {
          editor.endEdit();
        },
        keydown : function(event) {

          switch(event.keyCode) {

          case 113: // F2
            event.preventDefault();
            editor.editing = true;
            break;

          case 27: // Esc
            event.preventDefault();
            var cell = editor.cell;
            editor.endEdit(true); // cancel edit.
            editor.beginEdit(cell.row, cell.col);
            break;

          case 13: // Enter
            event.preventDefault();
            editor.move(event.shiftKey? -1 : 1, 0);
            break;

          case 9: // Tab
            event.preventDefault();
            editor.move(0, event.shiftKey? -1 : 1);
            break;

          case 37 : // Left
            if (!editor.editing) {
              event.preventDefault();
              editor.move(0, -1);
            }
            break;

          case 38 : // Up
            if (!editor.editing) {
              event.preventDefault();
              editor.move(-1, 0);
            }
            break;

          case 39 : // Right
            if (!editor.editing) {
              event.preventDefault();
              editor.move(0, 1);
            }
            break;

          case 40 : // Down
            if (!editor.editing) {
              event.preventDefault();
              editor.move(1, 0);
            }
            break;

          default :
            break;
          }
        }
      }
    }, tables.map(function(table) { return table.$el; }).
      concat([
        hScr1, hScr2, vScr1,
        hBar1, hBar2, vBar1, vBar2,
        vSplitHandle.$el ]) );

    var scrollIntoView = function(table, row, col) {

      var left = table.tableState.tableLeft;
      var top = table.tableState.tableTop;
      var minCol = table.tableState.minCol;
      var minRow = table.tableState.minRow;

      while (row < minRow) {
        minRow -= 1;
        top -= table.model.getCellHeightAt(minRow);
      }
      while (minRow < row) {
        top += table.model.getCellHeightAt(minRow);
        minRow += 1;
      }
      while (col < minCol) {
        minCol -= 1;
        left -= table.model.getCellWidthAt(minCol);
      }
      while (minCol < col) {
        left += table.model.getCellWidthAt(minCol);
        minCol += 1;
      }

      var width = table.model.getCellWidthAt(col);
      var height = table.model.getCellHeightAt(row);

      var deltaX = (left < 0)? left :
        (table.width < left + width)? (left + width) - table.width : 0;
      var deltaY = (top < 0)? top :
        (table.height < top + height)? (top + height) - table.height : 0;

      var scrolled = deltaX != 0 || deltaY != 0;

      if (scrolled) {
        if (table.tblCol == 1) {
          hScr1.scrollLeft += deltaX;
        } else if (table.tblCol == 2) {
          hScr2.scrollLeft += deltaX;
        }
        if (table.tblRow == 1) {
          vScr1.scrollTop += deltaY;
        }
      }

      return scrolled;
    };

    var editor = {

      impl : null,
      cell : null,
      editing : false,

      isValidCell : function(row, col) {
        var rowCount = table.model.getRowCount();
        var columnCount = table.model.getColumnCount();
        return 0 <= row && row < rowCount && 0 <= col && col < columnCount;
      },
      move : function(offsetRow, offsetCol) {
        var row = editor.cell.row;
        var col = editor.cell.col;
        do {
          row += offsetRow;
          col += offsetCol;
        } while (!this.isEditableAt(row, col) &&
            this.isValidCell(row + offsetRow, col + offsetCol) );
        if (this.isEditableAt(row, col) ) {
          this.beginEdit(row, col, true);
        }
      },
      isEditableAt : function(row, col) {
        return this.isValidCell(row, col) &&
          table.model.getCellAt(row, col).editable === true;
      },
      beginEdit : function(row, col, v) {

        this.endEdit();

        var targetTable = null;
        var rows = sumArr([0].concat(table.model.getNumRows() ) );
        var columns = sumArr([0].concat(table.model.getNumColumns() ) );

        tables.forEach(function(table) {
          if (rows[table.tblRow] <= row && row < rows[table.tblRow + 1] &&
              columns[table.tblCol] <= col && col < columns[table.tblCol + 1]) {
            targetTable = table;
          }
        });

        if (!targetTable) {
          return;
        }

        if (scrollIntoView(targetTable, row, col) ) {
          // scrolled, then render.
          table.render();
        }

        var targetTd = null;
        targetTable.tbody.children.forEach(function(tr) {
          tr.children.forEach(function(td) {
            if (td.row == row && td.col == col) {
              if (targetTd == null) {
                targetTd = td;
              }
            }
          });
        });

        if (targetTd == null) {
          return;
        }

        this.impl = targetTd.renderer.beginEdit(
            table.model.getCellAt(row, col) );
        this.cell = { row : row, col : col };
        this.editing = false;
      },

      endEdit :function(cancel) {

        if (this.impl == null) {
          return;
        }

        var impl = this.impl;
        var cell = this.cell;
        this.impl = null;
        this.cell = null;

        // IE will call endEdit again on focusout.
        var endState = impl.endEdit();

        if (cancel) {
          return;
        }

        if (endState && endState.newValue !== endState.oldValue) {
          table.model.trigger('valuechange', {
            row : cell.row,
            col : cell.col,
            newValue : endState.newValue,
            oldValue : endState.oldValue
          });
        }
      }
    }

    var table = util.extend(createUIEventTarget(), {

      $el : frame,

      model : tableModel,

      tables : tables,

      render : function() {

        var scrSize = measureScrSize(this.$el);

        var frameSize = {
          width : this.$el.clientWidth,
          height : this.$el.clientHeight
        };

        var rowCount = this.model.getRowCount();
        var columnCount = this.model.getColumnCount();
        var numRows = this.model.getNumRows();
        var numColumns = this.model.getNumColumns();

        // setup widths and heights
        var widths = [
          sumOf(this.model.getCellWidthAt.bind(this.model),
              0, numColumns[0]),
          sumOf(this.model.getCellWidthAt.bind(this.model),
              numColumns[0], numColumns[0] + numColumns[1]),
          sumOf(this.model.getCellWidthAt.bind(this.model),
              numColumns[0] + numColumns[1], columnCount)
        ];
        var heights = [
          sumOf(this.model.getCellHeightAt.bind(this.model),
              0, numRows[0]),
          sumOf(this.model.getCellHeightAt.bind(this.model),
              numRows[0], rowCount - numRows[2]),
          sumOf(this.model.getCellHeightAt.bind(this.model),
              rowCount - numRows[2], rowCount)
        ];

        // setup rows and columns
        var rows = sumArr([0].concat(numRows) );
        var columns = sumArr([0].concat(numColumns) );

        // setup contentWidth
        var contentWidth = Math.max(10,
            Math.min(this.model.getContentWidth(), widths[1]) );

        //
        hBar1.style.top = (heights[0] - 1) + 'px';
        hBar1.style.width = frameSize.width + 'px';
        hBar2.style.top = (frameSize.height -
            (heights[2] + scrSize.height) - 1) + 'px';
        hBar2.style.width = frameSize.width + 'px';

        vBar1.style.left = (widths[0] - 1) + 'px';
        vBar1.style.height = frameSize.height + 'px';
        vBar2.style.left = (widths[0] + contentWidth - 1) + 'px';
        vBar2.style.height = frameSize.height + 'px';

        vSplitHandle.$el.style.left = (widths[0] + contentWidth) + 'px';
        vSplitHandle.$el.style.height = heights[0] + 'px';
        vSplitHandle.barHeight = frameSize.height - scrSize.height;

        tables.forEach(function(table, t) {

          table.rowFrom = rows[table.tblRow];
          table.rowTo = rows[table.tblRow + 1];
          table.colFrom = columns[table.tblCol];
          table.colTo = columns[table.tblCol + 1];

          if (table.tblCol == 0) {
            table.$el.style.left = '0px';
            table.left = 0;
            table.width = widths[0];
          } else if (table.tblCol == 1) {
            table.$el.style.left = widths[0] + 'px';
            table.left = -hScr1.scrollLeft;
            table.width = contentWidth;
          } else if (table.tblCol == 2) {
            table.$el.style.left = (widths[0] + contentWidth) + 'px';
            table.left = -hScr2.scrollLeft;
            table.width = frameSize.width -
              (widths[0] + contentWidth + scrSize.width);
          }

          if (table.tblRow == 0) {
            table.$el.style.top = '0px';
            table.top = 0;
            table.height = heights[0];
          } else if (table.tblRow == 1) {
            table.$el.style.top = heights[0] + 'px';
            table.top = -vScr1.scrollTop;
            table.height = frameSize.height -
                (heights[0] + heights[2] + scrSize.height);
          } else if (table.tblRow == 2) {
            table.$el.style.top = (frameSize.height -
                (heights[2] + scrSize.height) ) + 'px';
            table.top = 0;;
            table.height = heights[2];
          }

          // layout scrollbars.
          if (table.tblCol == 2 && table.tblRow == 1) {
            util.set(vScr1, {
              style : {
                left : (frameSize.width - scrSize.width) + 'px',
                top : heights[0]+ 'px',
                width : scrSize.width + 'px',
                height : table.height + 'px'
              }
            });
            util.set(vScr1.firstChild, {
              style : { height : heights[1] + 'px' }
            });
          } else if (table.tblRow == 2 && table.tblCol == 1) {
            util.set(hScr1, {
              style : {
                left : widths[0] + 'px',
                top : (frameSize.height - scrSize.height) + 'px',
                width : table.width + 'px',
                height : scrSize.height + 'px'
              }
            });
            util.set(hScr1.firstChild, {
              style : { width : widths[1] + 'px' }
            });
          } else if (table.tblRow == 2 && table.tblCol == 2) {
            util.set(hScr2, {
              style : {
                left : (widths[0] + contentWidth) + 'px',
                top : (frameSize.height - scrSize.height) + 'px',
                width : table.width + 'px',
                height : scrSize.height + 'px'
              }
            });
            util.set(hScr2.firstChild, {
              style : { width : widths[2] + 'px' }
            });
          }

          table.prepare();

        }.bind(this));

        !function(table, tableState) {
          var left = tableState.tableLeft + widths[0];
          var handleIndex = 0;
          var handle;
          for (var col = tableState.minCol;
              col < tableState.maxCol; col += 1) {
            if (handleIndex >= columnResizeHandles.length) {
              var handle = createResizeHandle().
                on('move', function(event, detail) {
                  table.model.trigger('cellwidthchange',
                      { col : this.col, deltaX : detail.deltaX });
                });
              frame.appendChild(handle.$el);
              columnResizeHandles.push(handle);
            }
            left += this.model.getCellWidthAt(col);
            handle = columnResizeHandles[handleIndex];
            handle.$el.style.display = '';
            handle.$el.style.left = left + 'px';
            handle.$el.style.height = heights[0] + 'px';
            handle.col = col;
            handle.barHeight = frameSize.height - scrSize.height;
            handleIndex += 1;
          }
          for (;handleIndex < columnResizeHandles.length; handleIndex += 1) {
            handle = columnResizeHandles[handleIndex];
            columnResizeHandles[handleIndex].$el.style.display = 'none';
          }
          
        }.bind(this)(table, tables[1].tableState);

        var createDetail = function() {
          return {
            tables : tables.map(function(table, t) {
              return {
                tblRow : table.tblRow,
                tblCol : table.tblCol,
                tableState : table.tableState
              };
            })
          };
        };

        this.trigger('beforerender', createDetail() );

        tables.forEach(function(table, t) {
          table.render();
        }.bind(this));

        // TODO pending.
        //this.trigger('afterrender', createDetail() );
      }
    });

    return table;
  };

  var createInnerTable = function() {

    var colgroup = util.createElement('colgroup');
    var tbody = util.createElement('tbody');
    var table = util.createElement('table', {
      style : { position : 'absolute',
        tableLayout : 'fixed', borderCollapse : 'separate' },
      props : { cellSpacing : '0' }
    }, [ colgroup, tbody ]);
    var tableBg = util.createSVGElement('svg', {
      style : { position : 'absolute' }
    });
    var frame = util.createElement('div', {
      style : { position : 'absolute', overflow : 'hidden' },
      on : { scroll : function(event) {
        event.target.scrollLeft = event.target.scrollTop = 0; }}
    }, [ tableBg, table ]);

    return {

      $el : frame,
      model : null,

      tblRow : 0, tblCol : 0,
      left : 0, top : 0, width : 100, height : 100,
      rowFrom : 0, rowTo : 0,
      colFrom : 0, colTo : 0,

      colgroup : { $el : colgroup },
      tbody : { $el : tbody },

      tableState : {},

      setTableVisible : function(visible) {
        table.style.display = visible? '' : 'none';
      },

      setTableBgVisible : function(visible) {
        tableBg.style.display = visible? '' : 'none';
      },

      prepare : function() {

        var adjustMinRC = function() {

          var scanMinRow = Math.max(0, minRow - tableModel.maxRowSpan);
          var scanMinCol = Math.max(0, minCol - tableModel.maxColSpan);
          var spanedCell = null;

          for (var row = minRow; row >= scanMinRow; row -= 1) {
            for (var col = minCol; col >= scanMinCol; col -= 1) {
              var cell = tableModel.getCellAt(row, col, 'span');
              if (cell.rowSpan != 1 || cell.colSpan != 1) {
                spanedCell = { row : row, col : col };
              }
            }
          }

          if (!spanedCell) {
            // not found.
            return;
          }

          for (var row = minRow; row > spanedCell.row; row -= 1) {
            minRow -= 1;
            top -= tableModel.getCellHeightAt(minRow);
          }
          for (var col = minCol; col > spanedCell.col; col -= 1) {
            minCol -= 1;
            left -= tableModel.getCellWidthAt(minCol);
          }
        };

        var tableModel = this.model;

        var left = this.left, top = this.top,
          width = this.width, height= this.height;
        var col, row, cellWidth, cellHeight;
        var tableLeft, tableTop, minCol, maxCol, minRow, maxRow;

        for (col = this.colFrom; col < this.colTo; col += 1) {
          cellWidth = tableModel.getCellWidthAt(col);
          if (left + cellWidth > 0) {
            break;
          }
          left += cellWidth;
        }

        for (row = this.rowFrom; row < this.rowTo; row += 1) {
          cellHeight = tableModel.getCellHeightAt(row);
          if (top + cellHeight > 0) {
            break;
          }
          top += cellHeight;
        }

        minCol = col;
        minRow = row;

        adjustMinRC();

        tableLeft = left;
        tableTop = top;

        for (col = minCol; col < this.colTo; col += 1) {
          cellWidth = tableModel.getCellWidthAt(col);
          if (left + cellWidth >= width) {
            break;
          }
          left += cellWidth;
        }

        for (row = minRow; row < this.rowTo; row += 1) {
          cellHeight = tableModel.getCellHeightAt(row);
          if (top + cellHeight >= height) {
            break;
          }
          top += cellHeight;
        }

        maxCol = Math.min(this.colTo - 1, col);
        maxRow = Math.min(this.rowTo - 1, row);

        // store state.
        this.tableState = {
          tableLeft : tableLeft,
          tableTop : tableTop,
          minCol : minCol,
          maxCol : maxCol,
          minRow : minRow,
          maxRow : maxRow
        };
      },

      render : function() {

        var tableModel = this.model;

        var minCol = this.tableState.minCol;
        var maxCol = this.tableState.maxCol;
        var minRow = this.tableState.minRow;
        var maxRow = this.tableState.maxRow;

        // render colgroup

        var tableWidth = 0;
        var colIndex = 0;
        for (var col = minCol; col <= maxCol; col += 1) {
          var cellWidth = tableModel.getCellWidthAt(col);
          getOrCrt('col', colIndex, this.colgroup).
            $el.style.width = cellWidth + 'px';
          colIndex += 1;
          tableWidth += cellWidth;
        }
        for (; colIndex < this.colgroup.$el.childNodes.length; colIndex += 1) {
          this.colgroup.$el.childNodes[colIndex].style.width = '0px';
        }

        util.set(table, { style : {
          width : tableWidth + 'px'
        }});

        // render tbody

        var spanMap = createSpanMap();

        var trIndex = 0;
        for (var row = minRow; row <= maxRow; row += 1) {

          var tr = getOrCrt('tr', trIndex, this.tbody, function(tr) {
            tr.$el.style.lineWidth = '1';
          });
          tr.$el.style.height = tableModel.getCellHeightAt(row) + 'px';
          tr.row = row;

          var tdIndex = 0;
          for (var col = minCol; col <= maxCol; col += 1) {
            if (spanMap.isSpaned(row, col) ) {
              continue;
            }
            var td = getOrCrt('td', tdIndex, tr, function(td) {
              td.renderer = null;
              td.tableModel = tableModel;
              td.colSpan = 1;
              td.rowSpan = 1;
              td.className = '';
            });
            var cell = tableModel.getCellAt(row, col);
            spanMap.setSpaned(row, col, cell);
            td.row = row;
            td.col = col;

            if (td.colSpan != cell.colSpan) {
              td.colSpan = cell.colSpan
              td.$el.colSpan = td.colSpan;
            }
            if (td.rowSpan != cell.rowSpan) {
              td.rowSpan = cell.rowSpan
              td.$el.rowSpan = td.rowSpan;
            }
            var className = cell.className || '';
            if (td.className != className) {
              td.className = className;
              util.set(td.$el, { attrs : { 'class' : td.className} });
            }

            var factory = cell.factory || defaultCellRendererFactory;

            if (td.factory != factory) {
              td.factory = factory;
              if (td.renderer) {
                td.renderer.dispose();
              }
              td.$el.innerHTML = '';
              td.renderer = td.factory(td);
            }

            td.renderer.render(cell);

            tdIndex += 1;
          }
          trIndex += 1;
        }

        for (; trIndex < this.tbody.$el.childNodes.length; trIndex += 1) {
          var restTds = this.tbody.children[trIndex].children;
          for (var i = 0; i < restTds.length; i += 1) {
            restTds[i].renderer.render({});
          }
          this.tbody.$el.childNodes[trIndex].style.height = '0px';
        }

        util.set(table, { style : {
          left : this.tableState.tableLeft + 'px',
          top : this.tableState.tableTop + 'px'
        }});

        var width = Math.max(0, this.width);
        var height = Math.max(0, this.height);

        util.set(tableBg, {
          style : { left : '0px', top : '0px' },
          attrs : { width : '' + width, height : '' + height }
        });

        util.set(this.$el, { style : {
          width : width + 'px',
          height : height + 'px'
        }});
      }
    };
  };

  // what's going wrong with IE9?
  if (!window.console) {
    window.console = { log : function() {} };
  }

  // self check
  !function() {

    var assertEquals = function(expected, actual) {
      if (expected !== actual) {
        throw 'expected ' + JSON.stringify(expected) +
            ' but ' + JSON.stringify(actual);
      }
    };

    assertEquals('1,230.12',
        util.formatNumber(util.toNarrowNumber('123０．１２３'), 2) );
    assertEquals('123.123',
        util.formatNumber(util.toNarrowNumber('123．１２３'), 3) );
    assertEquals('1,230.12',
        util.formatNumber(util.toNarrowNumber('+123０．１２３'), 2) );
    assertEquals('-1,230.12',
        util.formatNumber(util.toNarrowNumber('-123０．１２３'), 2) );
  }();

  var i18n = {
    getInstance : function(lang) {
      lang = lang || navigator.language || navigator.userLanguage;
      return util.extend({}, i18n.en, i18n[lang] ||
          i18n[lang.replace(/\-\w+$/, '')] || {});
    },
    en : { messages : { DAY_NAMES : 'Su,Mo,Tu,We,Th,Fr,Sa' } },
    ja : { messages : { DAY_NAMES : '日,月,火,水,木,金,土' } }
  };

  prLib.util = util;
  prLib.i18n = i18n;
  prLib.createTable = createTable;
  prLib.createTableModel = createTableModel;
  prLib.defaultCellRendererFactory = defaultCellRendererFactory;

}(window.prLib || (window.prLib = {}) );
