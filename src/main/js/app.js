//
// gantt-app
// @author Kazuhiko Arase
// Licensed under MIT LICENSE
//

'use strict';

!function(prLib) {

  var DAY_IN_MILLIS = 1000 * 3600 * 24;

  var updateTasks = function(tableModel) {
    var util = prLib.util;
    var taskCount = tableModel.getTaskCount();
    var wbsId = [];
    for (var row = 0; row < taskCount; row += 1) {
      var task = tableModel.getTaskAt(row);
      task.grouped = row + 1 < taskCount &&
        tableModel.getTaskAt(row + 1).indent > task.indent;
      // set wbsId
      while (wbsId.length <= task.indent) {
        wbsId.push(0);
      }
      if (wbsId.length > task.indent + 1) {
        wbsId = wbsId.slice(0, task.indent + 1);
      }
      wbsId[task.indent] += 1;
      task.wbsId = wbsId.join('.');

      if (!task.grouped) {
        // calc elapsed and remain
        var elapsed = 0;
        var minActDate = '';
        var maxActDate = '';
        for (var actDate in task.act) {
          if (!minActDate) {
            minActDate = maxActDate = actDate;
          } else {
            minActDate = util.min(minActDate, actDate);
            maxActDate = util.max(maxActDate, actDate);
          }
          elapsed += +task.act[actDate];
        }
        var est = task.currEst || task.origEst;
        var remain = +est - elapsed;
        task.elapsed = elapsed != 0? util.formatNumber(elapsed, 2) : '';
        task.remain = est == ''? '' : util.formatNumber(remain, 2);

        task.actStartDate = minActDate;
        task.actFinishDate = maxActDate;

        if (+task.remain != 0) {
          // does not finish yet.
          task.actFinishDate = '';
        }
      }
    }
  };

  var createTaskExByRow = function(opts, groupItems, tableModel) {

    var createTaskExAt = function(row) {

      var task = tableModel.getTaskAt(row);
      var taskEx = { act : {} };

      if (!task.grouped) {

        var simState = null;

        // calc est
        if (task.startDate) {
          simState = {
            date : util.strToDate(task.startDate),
            hours : 0
          };
          for (var i = 0; i < 30; i += 1) {
            simState.hours =
              opts.getActHours(simState.date, task.assignee);
            if (simState.hours > 0) {
              break;
            }
            simState.date.setDate(simState.date.getDate() + 1);
          }
        }
        if (lastSimState[task.assignee]) {
          if (simState && +simState.date >
            +lastSimState[task.assignee].date) {
          } else {
            simState = lastSimState[task.assignee];
          }
        }

        if (simState) {
          taskEx.simStartDate = util.parseDate(simState.date);
          taskEx.simStartHours = simState.hours;
        }

        var est = task.currEst || task.origEst;
        if (est && simState) {

          var simEst = 0;
          est = +est;

          while (est > 0) {

            if (est >= simState.hours) {
              if  (simState.hours > 0) {
                simEst += simState.hours;
                est -= simState.hours;
                simState.hours = 0;
              } else {
                simEst += opts.dayInHours;
              }
            } else {
              simEst += est;
              simState.hours -= est;
              est = 0;
            }

            if (est > 0) {
              simState.date.setDate(simState.date.getDate() + 1);
              simState.hours +=
                opts.getActHours(simState.date, task.assignee);
            }
          }

          lastSimState[task.assignee] = simState;
          taskEx.simFinishDate = util.parseDate(simState.date);
          taskEx.simEndHours = simState.hours;
          taskEx.simEst = simEst;
        }
      }

      return taskEx;
    };

    var util = prLib.util;
    var taskCount = tableModel.getTaskCount();
    var lastSimState = {};

    // phase1
    var taskExByRow = function() {
      taskExByRow = {};
      for (var i = 0; i < taskCount; i += 1) {
        taskExByRow[i] = createTaskExAt(i);
      }
      return taskExByRow;
    }();

    // phase2
    for (var row = 0; row < taskCount; row += 1) {
      var task = tableModel.getTaskAt(row);
      var taskEx = taskExByRow[row];
      if (task.grouped) {
        var leafs = [];
        for (var r = row + 1; r < taskCount; r += 1) {
          var currTask = tableModel.getTaskAt(r);
          if (currTask.indent <= task.indent) {
            break;
          }
          if (r + 1 < taskCount &&
              tableModel.getTaskAt(r + 1).indent > currTask.indent) {
            // grouped
          } else {
            // leaf
            leafs.push({ task : currTask, taskEx : taskExByRow[r] });
          }
        }
        //taskEx.lastLeaf = leafs[leafs.length - 1];
        for (var dataField in groupItems) {
          if (dataField == 'assignee') {
            taskEx.assignees = groupItems[dataField](leafs);
          } else {
            taskEx[dataField] = groupItems[dataField](leafs);
          }
        }

        if (+taskEx.remain != 0) {
          // does not finish yet.
          taskEx.actFinishDate = '';
        }

        // calc group act.
        var act = {};
        for (var i = 0; i < leafs.length; i += 1) {
          var leafAct = leafs[i].task.act;
          for (var d in leafAct) {
            if (act[d]) {
              act[d] += +leafAct[d];
            } else {
              act[d] = +leafAct[d];
            }
          }
        }
        for (var d in act) {
          taskEx.act[d] = util.formatNumber(act[d], 2);
        }
      }
    }

    return taskExByRow;
  };

  var createPrTable = function(opts) {

    var util = prLib.util;
    var i18n = prLib.i18n;
    var createTable = prLib.createTable;
    var createTableModel = prLib.createTableModel;
    var defaultCellRendererFactory = prLib.defaultCellRendererFactory;

    opts = util.extend({
      maxIndent : 8,
      dayInHours : 7.75,
      isHoliday : function(date) {
        return date.getDay() == 0 || date.getDay() == 6;
      },
      getActHours : function(date, assignee) {
        return this.isHoliday(date)? 0 : opts.dayInHours;
      }
    }, opts || {});

    var dateSpecs = [
      { colSpan : 7, cellInDays : 1, dateCellWidth : 40 },
      { colSpan : 4, cellInDays : 7, dateCellWidth : 25 }
    ];

    var messages = getMessages();

    var template = {
      thead : [
        [
          { label: '', colSpan : 4 },
          { label: messages.MAN_HOURS, colSpan : 4 },
          { label: messages.ORIGINAL, colSpan : 2 },
          { label: messages.ACTUAL, colSpan : 2 },
          { label: messages.LINK, colSpan : 2 }
        ],
        [
          { label: messages.WBS, dataField: 'wbsId', width: 50 },
          { label: messages.TASK_ID, dataField: 'taskId', width: 50 },
          { label: messages.TASK_NAME, dataField: 'taskName', editable: true },
          { label: messages.ASSIGNEE, dataField: 'assignee',
            dataType: 'select-one', editable: true, filterEnabled : true,
            width : 50,
            options : function() {
              return table.model.getUserOptions().list;
            },
            allowAnonymousOption : true
          },
          { label: messages.ORIG_EST, dataField: 'origEst', width : 60,
            dataType: 'number', decimalDigits: 2, editable: true },
          { label: messages.CURR_EST, dataField: 'currEst', width : 60,
            dataType: 'number', decimalDigits: 2, editable: true },
          { label: messages.ELAPSED, dataField: 'elapsed', width : 60,
            dataType: 'number', decimalDigits: 2 },
          { label: messages.REMAIN, dataField: 'remain', width : 60,
            dataType: 'number', decimalDigits: 2 },
          { label: messages.START_DATE, dataField: 'startDate',
            dataType: 'date', editable: true },
          { label: messages.FINISH_DATE, dataField: 'finishDate',
            dataType: 'date', editable: true },
          { label: messages.START_DATE, dataField: 'actStartDate',
            dataType: 'date', editable: false },
          { label: messages.FINISH_DATE, dataField: 'actFinishDate',
            dataType: 'date', editable: false },
          { label: messages.LINK_TYPE, dataField: 'linkType', width: 40,
            dataType: 'select-one', editable: true,
            options : function() {
              return [ '', 'FS', 'FF', 'SS', 'SF' ].map(function(type) {
                return { value : type, label : type };
              });
            }
          },
          { label: messages.LINKED_TASK, dataField: 'linkedTaskId',
            dataType: 'select-one', editable: true,
            options : function() {
              return table.model.getTaskOptions().list.map(function(opt) {
                return {
                  label : opt.value? opt.value + ':' + opt.label : opt.label,
                  value : opt.value
                };
              });
            },
            labelFunction : function(value) {
              var label = table.model.getTaskOptions().map[value];
              return typeof label == 'string'?
                  (value? value + ':' + label : label) : '?';
            }
          }/*,
          { label:'Memo1', editable : true, dataField : 'memo1' },
          { label:'Memo2', editable : true, dataField : 'memo2' },
          { label:'Memo3', editable : true, dataField : 'memo3' },
          { label:'Memo4', editable : true, dataField : 'memo4' }*/
        ]
      ]
    };

    var getStyleAt = function(){

      var styles = function(){
        var styles = {};
        var row = 0;
        template.thead.forEach(function(tr) {
          var col = 0;
          tr.forEach(function(cell) {
            cell = util.extend(
                { rowSpan : 1, colSpan : 1, label : '' }, cell);
            var cellId = util.getCellId(row, col);
            styles[cellId] = cell;
            col += cell.colSpan;
          });
          row += 1;
        });
        return styles;
      }();

      return function(row, col) {
        var cellId = util.getCellId(row, col);
        return styles[cellId] || {};
      };
    }();

    var groupItems = function() {

      var sumFunc = function(prop) {
        return function(leafs) {
          var sum = 0;
          var empty = true;
          for (var i = 0; i < leafs.length; i += 1) {
            if (empty && leafs[i].task[prop].length > 0) {
              empty = false;
            }
            sum += +(leafs[i].task[prop] || '0');
          }
          return empty? '' : '' + sum;
        };
      };

      var minDateFunc = function(task, prop) {
        return function(leafs) {
          var value = '';
          for (var i = 0; i < leafs.length; i += 1) {
            var date = leafs[i][task][prop];
            if (date) {
              if (value) {
                value = util.min(value, date);
              } else {
                value = date;
              }
            }
          }
          return value;
        };
      };

      var maxDateFunc = function(task, prop) {
        return function(leafs) {
          var value = '';
          for (var i = 0; i < leafs.length; i += 1) {
            var date = leafs[i][task][prop];
            if (date) {
              if (value) {
                value = util.max(value, date);
              } else {
                value = date;
              }
            }
          }
          return value;
        };
      };

      return {
        startDate : minDateFunc('task', 'startDate'),
        finishDate : maxDateFunc('task', 'finishDate'),
        actStartDate : minDateFunc('task', 'actStartDate'),
        actFinishDate : maxDateFunc('task', 'actFinishDate'),
        simStartDate : minDateFunc('taskEx', 'simStartDate'),
        simFinishDate : maxDateFunc('taskEx', 'simFinishDate'),
        origEst : sumFunc('origEst'),
        currEst : sumFunc('currEst'),
        elapsed : sumFunc('elapsed'),
        remain : sumFunc('remain'),
        assignee : function(leafs) {
          var exists = {};
          var assignees = [];
          for (var i = 0; i < leafs.length; i += 1) {
            var assignee = leafs[i].task.assignee;
            if (!assignee) {
              continue;
            }
            if (!exists[assignee]) {
              exists[assignee] = true;
              assignees.push(assignee);
            }
          }
          return assignees;
        }
      };
    }();

    var table = createTable(util.extend(createTableModel(), {

      tasks : null,
      selectedRows : [],

      dateTableState : null,

      taskExByRow : null,
      viewRows : null,
      rowByTaskId : null,
      dateInfo : null,
      userOptions : null,
      taskOptions : null,

      invalidateTasks : function() {
        this.taskExByRow = null;
        this.viewRows = null;
        this.rowByTaskId = null;
        this.dateInfo = null;
        this.userOptions = null;
        this.taskOptions = null;
      },

      getUserOptions : function() {
        if (this.userOptions == null) {
          var map = {};
          var list = [ { label : '', value : '' } ];
          this.tasks.forEach(function(task) {
            if (task.assignee && !map[task.assignee]) {
              map[task.assignee] = true;
              list.push({ label : task.assignee, value : task.assignee });
            }
          });
          list.sort(function(o1, o2) {
            return o1.value < o2.value? -1 : 1;
          });
          this.userOptions = { map : map, list : list };
        }
        return this.userOptions;
      },
      getTaskOptions : function() {
        if (this.taskOptions == null) {
          var map = {};
          var list = [ { taskId : 0, taskName : '' } ].
            concat(this.tasks).
            map(function(task) {
              map[task.taskId] = task.taskName;
              return { value : task.taskId, label : task.taskName };
            });
          this.taskOptions = { map : map, list : list };
        }
        return this.taskOptions;
      },

      getDateInfo : function() {
        if (!this.dateInfo) {
          this.dateInfo = this.createDateInfo();
        }
        return this.dateInfo;
      },
      createDateInfo : function() {

        var viewRows = this.getViewRows();
        var minDate = '';
        var maxDate = '';

        for (var i = 0; i < viewRows.length; i += 1) {
          var taskEx = this.getTaskExAt(i);
          if (taskEx.simStartDate) {
            if (!minDate) {
              minDate = maxDate = taskEx.simStartDate;
            } else {
              minDate = util.min(minDate, taskEx.simStartDate);
              maxDate = util.max(maxDate, taskEx.simStartDate);
            }
          }
          if (taskEx.simFinishDate) {
            if (!minDate) {
              minDate = maxDate = taskEx.simFinishDate;
            } else {
              minDate = util.min(minDate, taskEx.simFinishDate);
              maxDate = util.max(maxDate, taskEx.simFinishDate);
            }
          }
        }

        var dateFrom = new Date();
        var dateTo = new Date();
        if (minDate) {
          dateFrom = util.strToDate(minDate);
          dateTo = util.strToDate(maxDate);
        }

        // fix to nearest monday.
        dateFrom = new Date(
            dateFrom.getFullYear(),
            dateFrom.getMonth(),
            dateFrom.getDate() - (dateFrom.getDay() + 6) % 7);

        var dateSpec = this.getDateSpec();
        var numColumns = Math.floor(
            (dateTo.getTime() - dateFrom.getTime() ) / DAY_IN_MILLIS /
            (dateSpec.colSpan * dateSpec.cellInDays) + 1) * dateSpec.colSpan;

        return {
          numColumns : numColumns,
          getDate : function(offset) {
            return new Date(dateFrom.getFullYear(),
                dateFrom.getMonth(), dateFrom.getDate() + offset);
          }
        };
      },
      acceptTask : function(task) {
        /*
        if (typeof task.assignees == 'object') {
          return task.assignees.length > 0;
        } else {
          return task.assignee == 'Bob';
        }
        */
        return true;
      },
      getViewRows : function() {
        if (this.viewRows == null) {
          // update task properties.
          updateTasks(this);
          var viewRows = [];
          var taskCount = this.getTaskCount();
          for (var row = 0; row < taskCount; row += 1) {
            var task = this.getTaskAt(row);
            if (task.grouped || this.acceptTask(task) ) {
              viewRows.push(row);
            }
          }
          //this.getTaskExAt(0);
          var taskExByRow = createTaskExByRow(opts, groupItems, {
            getTaskCount : function() { return viewRows.length; },
            getTaskAt : function(row) {
              return this.getTaskAt(viewRows[row]);
            }.bind(this)
          });
          this.viewRows = viewRows.filter(function(row, r) {
            var task = this.getTaskAt(row);
            return this.acceptTask(task.grouped? taskExByRow[r] : task);
          }.bind(this) );
        }
        return this.viewRows;
      },
      getTaskExAt : function(row) {
        if (!this.taskExByRow) {
          var viewRows = this.getViewRows();
          this.taskExByRow = createTaskExByRow(opts, groupItems, {
            getTaskCount : function() { return viewRows.length; },
            getTaskAt : function(row) {
              return this.getTaskAt(viewRows[row]);
            }.bind(this)
          });
        }
        return this.taskExByRow[row];
      },
      getRowByTaskId : function(taskId) {
        if (!this.rowByTaskId) {
          var rowByTaskId = {};
          var taskCount = this.getTaskCount();
          for (var i = 0; i < taskCount; i += 1) {
            rowByTaskId[this.getTaskAt(i).taskId] = i;
          }
          this.rowByTaskId = rowByTaskId;
        }
        return this.rowByTaskId[taskId];
      },
      getTaskCount : function() {
        return this.tasks.length;
      },
      getTaskAt : function(row) {
        return this.tasks[row];
      },
      getSelectedRows : function() {
        return this.selectedRows;
      },
      setSelectedRows : function(selectedRows) {
        this.selectedRows = selectedRows;
      },
      getNumColumns : function() {
        return [ 1, template.thead[1].length, this.getDateInfo().numColumns ];
      },
      getNumRows : function() {
        return [ template.thead.length, this.getViewRows().length, 1 ];
      },
      getContentWidth : function() {
        return this.userSettings.contentWidth;
      },
      setContentWidth : function(contentWidth) {
        this.userSettings.contentWidth = contentWidth;
      },
      setCellWidthAt : function(col, cellWidth) {
        this.userSettings.cellWidths[col] =
          Math.max(10, Math.min(cellWidth, 300) );
      },
      getCellWidthAt : function(col) {
        var numColumns = this.getNumColumns();
        if (col < numColumns[0]) {
          return 20;
        } else if (col < numColumns[0] + numColumns[1]) {
          if (this.userSettings.cellWidths[col]) {
            return this.userSettings.cellWidths[col];
          }
          var templateCell = getStyleAt(1, col - numColumns[0]);
          return templateCell.width || 80;
        } else {
          return this.getDateSpec().dateCellWidth;
        }
      },

      getCellHeightAt : function(row) {
        return 20;
      },

      getCellAt : function(row, col, hint) {

        var numColumns = this.getNumColumns();
        var numRows = this.getNumRows();
        var r, c;

        var dateSpec = this.getDateSpec();
        var dateInfo = this.getDateInfo();

        var cell = { value : '', colSpan : 1, rowSpan : 1, className : '' };

        if (row < numRows[0]) {
          cell.className += ' ${prefix}-header';
          if (col < numColumns[0]) {

          } else if (col < numColumns[0] + numColumns[1]) {
            util.extend(cell, getStyleAt(row, col - numColumns[0]) );
            cell.factory = headerFactory;
            cell.value = cell.label || '';
            delete cell.editable;
            delete cell.dataType;
            delete cell.labelFunction;
          } else {
            c = col - (numColumns[0] + numColumns[1]);
            var date = dateInfo.getDate(c * dateSpec.cellInDays);
            if (opts.isHoliday(date) ) {
              cell.className += ' ${prefix}-holiday';
            }
            if (row == 0) {
              if (c % dateSpec.colSpan == 0) {
                cell.value = date.getFullYear() +
                  '/' + (date.getMonth() + 1) +
                  '/' + date.getDate();
                cell.colSpan = dateSpec.colSpan;
              }
            } else {
              cell.className += ' ${prefix}-date';
              cell.value = '' + date.getDate();
            }
          }

        } else if (row < numRows[0] + numRows[1]) {

          r = row - numRows[0];

          if (hint == 'span') {
            // skip
          } else {
            if (this.selectedRows.indexOf(r) != -1) {
              cell.className += ' ${prefix}-selected';
            }
          }

          if (col < numColumns[0]) {
          } else if (col < numColumns[0] + numColumns[1]) {

            if (hint == 'span') {
              // skip
            } else {

              var task = this.getTaskAt(this.getViewRows()[r]);
              var taskEx = this.getTaskExAt(r);

              util.extend(cell, getStyleAt(1, col - numColumns[0]) );
              if (cell.dataType == 'number') {
                cell.className += ' ${prefix}-number';
              }
              if (cell.dataField == 'taskName') {
                cell.className += ' ${prefix}-indent' + task.indent;
              }

              if (cell.dataField == 'wbsId' ||
                  cell.dataField == 'taskId' ||
                  cell.dataField == 'elapsed' ||
                  cell.dataField == 'remain' ||
                  cell.dataField == 'actStartDate' ||
                  cell.dataField == 'actFinishDate') {
                cell.className += ' ${prefix}-readonly';
              }

              cell.value = task[cell.dataField];

              if (task.grouped && groupItems[cell.dataField]) {
                cell.value = cell.dataField == 'assignee'?
                    taskEx.assignees.join(',') : taskEx[cell.dataField];
                cell.editable = false;
                cell.className += ' ${prefix}-grouped';
              }

              if (!task.grouped && cell.dataField == 'remain') {
                var remain = +cell.value;
                if (remain == 0) {
                  cell.className += ' ${prefix}-good';
                } else if (remain < 0) {
                  cell.className += ' ${prefix}-bad';
                }
              }
            }

          } else {

            if (hint == 'span') {
              // skip
            } else {

              cell.factory = graphFactory;

              c = col - (numColumns[0] + numColumns[1]);
              var date = dateInfo.getDate(c * dateSpec.cellInDays);
              if (opts.isHoliday(date) ) {
                cell.className += ' ${prefix}-holiday';
              }

              var task = this.getTaskAt(this.getViewRows()[r]);
              var taskEx = this.getTaskExAt(r);

              cell.dataType = 'number';
              cell.decimalDigits = 2;
              cell.className += ' ${prefix}-number';

              if (task.grouped) {
                cell.className += ' ${prefix}-grouped';
                cell.value = (taskEx.act || {})[util.parseDate(date)] || '';
              } else if (dateSpec.cellInDays == 1) {
                cell.editable = true;
                cell.value = (task.act || {})[util.parseDate(date)] || '';
              } else {
                cell.editable = false;
                cell.value = '';
              }

              if (cell.value) {
                cell.className += ' ${prefix}-act-label';
              }

              var minCol = Math.max(this.dateTableState.minCol,
                  numColumns[0] + numColumns[1]);

              if (col == minCol) {

                cell.graphParams = {
                  baseDate : date,
                  dayInPixel : dateSpec.dateCellWidth / dateSpec.cellInDays,
                  task : task,
                  taskEx : taskEx
                };

              }
            }
          }

        } else {
          cell.className += ' ${prefix}-footer';
        }

        return cell;
      },

      dateSpecsIndex : 0,
      setDateSpecIndex : function(dateSpecsIndex) {
        this.dateSpecsIndex = dateSpecsIndex;
        this.invalidateTasks();
        table.invalidate();
      },
      getDateSpec : function() {
        return dateSpecs[this.dateSpecsIndex];
      },

      getTrimedTasks : function() {
        var keys = Object.keys(createTask() );
        return this.tasks.map(function(task) {
          var newTask = {};
          keys.forEach(function(k) {
            newTask[k] = task[k];
          });
          return newTask;
        });
      },

      valuechangeHandler : function(event, detail) {

        var numColumns = this.getNumColumns();
        var numRows = this.getNumRows();
        var row = detail.row;
        var col = detail.col;
        var r, c;

        var dateInfo = this.getDateInfo();

        if (row < numRows[0]) {

        } else if (row < numRows[0] + numRows[1]) {

          r = row - numRows[0];

          if (col < numColumns[0]) {

          } else if (col < numColumns[0] + numColumns[1]) {

            c = col - numColumns[0];
            var templateCell = getStyleAt(1, c);
            var dataField = templateCell.dataField;
            this.getTaskAt(this.getViewRows()[r])[dataField] = detail.newValue;

            this.invalidateTasks();
            table.render();

          } else {

            c = col - (numColumns[0] + numColumns[1]);
            var date = dateInfo.getDate(c);
            var task = this.getTaskAt(this.getViewRows()[r]);
            if (detail.newValue) {
              task.act[util.parseDate(date)] = detail.newValue;
            } else {
              delete task.act[util.parseDate(date)];
            }

            this.invalidateTasks();
            table.render();
          }
        }
      }
    } ) );

    !function(tables) {
      tables.forEach(function(table) {
        if (table.tblRow != 1) {
          return;
        }
        var hoverHandler = function(event) {
          var td = util.closest(event.target, { tagName : 'TD' });
          if (td) {
            var tdIndex = util.indexOf(td);
            var trIndex = util.indexOf(td.parentNode);
            var row = table.tbody.children[trIndex].row;
            tables.forEach(function(table) {
              table.tbody.children.forEach(function(tr) {
                var className = (event.type == 'mouseover' && row == tr.row)?
                    ' ${prefix}-selected' : '';
                if (tr.className != className) {
                  tr.className = className;
                  util.set(tr.$el, { attrs : { 'class' : tr.className } });
                }
              });
            });
          }
        };
        util.$(table.$el).
          on('mouseover', hoverHandler).
          on('mouseout', hoverHandler);
      });
    }(table.tables);

    table.model.on('valuechange', table.model.valuechangeHandler);

    var createTask = function() {
      return {
        indent : 0,
        wbsId : '',
        taskId : 0,
        taskName : '',
        assignee : '',
        origEst : '',
        currEst : '',
        elapsed : '',
        remain : '',
        startDate : '',
        finishDate : '',
        actStartDate : '',
        actFinishDate : '',
        linkType : '',
        linkedTaskId : 0,
        act : {}
      };
    };

    var action = function(label) {

      var swapTask = function(row1, row2) {
        var task = this[viewRows[row1]];
        this[viewRows[row1]] = this[viewRows[row2]];
        this[viewRows[row2]] = task;
      };

      var messages = i18n.getInstance().messages;

      var viewRows = table.model.getViewRows();
      var selectedRows = table.model.getSelectedRows().slice();
      selectedRows.sort();

      if (label == messages.INSERT_ROW) {

        if (selectedRows.length == 1) {

          var selectedViewRow = viewRows[selectedRows[0]];

          var newTasks = [];
          var maxTaskId = 0;
          table.model.tasks.forEach(function(task, i) {
            newTasks.push(task);
            maxTaskId = Math.max(maxTaskId, task.taskId);
            if (i == selectedViewRow) {
              newTasks.push(createTask() );
            }
          });
          maxTaskId += 1;

          var newIndex = selectedViewRow + 1;
          newTasks[newIndex].indent = newTasks[selectedViewRow].indent;
          newTasks[newIndex].taskId = maxTaskId;
          newTasks[newIndex].taskName = 'Task#' + maxTaskId;

          table.model.tasks = newTasks;
          table.model.invalidateTasks();
          table.invalidate();
        }

      } else if (label == messages.DELETE_ROW) {

        var rows = {};
        selectedRows.forEach(function(row) { rows[viewRows[row]] = true; });

        var newTasks = [];
        table.model.tasks.forEach(function(task, i) {
          if (!rows[i]) {
            newTasks.push(task);
          }
        });

        table.model.setSelectedRows([]);
        table.model.tasks = newTasks;
        table.model.invalidateTasks();
        table.invalidate();

      } else if (label == messages.MOVE_UP) {

        var newTasks = table.model.tasks.slice();
        var rows = [ -1 ].concat(selectedRows);

        for (var i = 1; i < rows.length; i += 1) {
          if (rows[i] - 1 > rows[i - 1]) {
            swapTask.call(newTasks, rows[i], rows[i] - 1);
            rows[i] -= 1;
          }
        }

        table.model.setSelectedRows(rows.slice(1) );
        table.model.tasks = newTasks;
        table.model.invalidateTasks();
        table.invalidate();

      } else if (label == messages.MOVE_DOWN) {

        var newTasks = table.model.tasks.slice();
        var rows = selectedRows.concat([ newTasks.length ]).reverse();

        for (var i = 1; i < rows.length; i += 1) {
          if (rows[i] + 1 < rows[i - 1]) {
            swapTask.call(newTasks, rows[i], rows[i] + 1);
            rows[i] += 1;
          }
        }

        table.model.setSelectedRows(rows.slice(1) );
        table.model.tasks = newTasks;
        table.model.invalidateTasks();
        table.invalidate();

      } else if (label == messages.INDENT_UP ||
          label == messages.INDENT_DOWN) {

        selectedRows.forEach(function(row) {
          var task = table.model.getTaskAt(viewRows[row]);
          var indent = task.indent;
          var maxIndent = row > 0?
              table.model.getTaskAt(row - 1).indent + 1 : 0;
          maxIndent = Math.min(maxIndent, opts.maxIndent);
          indent += (label == messages.INDENT_UP)? -1 : 1;
          indent = Math.max(0, Math.min(indent, maxIndent) );
          task.indent = indent;
        });

        table.model.invalidateTasks();
        table.invalidate();
      }
    };

    util.$(table.$el).on('contextmenu', function(event) {
      event.preventDefault();
    });

    table.on('mousedown', function(event, detail) {

      if (detail.originalEvent.which != 3) {
        return;
      }

      var mouseupHandler = function(event) {
        if (util.closest(event.target, { $el : contextmenu }) ) {
          return;
        }
        dispose();
        util.$(document).off('mouseup', mouseupHandler);
      };
      util.$(document).on('mouseup', mouseupHandler);

      var dispose = function() {
        if (contextmenu) {
          document.body.removeChild(contextmenu);
          contextmenu = null;
        }
      };

      var messages = i18n.getInstance().messages;

      var cs = window.getComputedStyle(detail.originalEvent.target, null);
      var contextmenu = util.createElement('div', {
        attrs : { 'class' : '${prefix}-contextmenu' },
        style : {
          position : 'absolute',
          left : detail.originalEvent.pageX + 'px',
          top : detail.originalEvent.pageY + 'px',
          fontFamily : cs.fontFamily,
          fontSize : cs.fontSize
        },
        on : {
          contextmenu : function(event) {
            event.preventDefault();
          }
        } }, [
          messages.INSERT_ROW,
          messages.DELETE_ROW,
          messages.MOVE_UP,
          messages.MOVE_DOWN,
          messages.INDENT_UP,
          messages.INDENT_DOWN
        ].map(function(label) {
          return util.createElement('div', {
            attrs : { 'class' : '${prefix}-menuitem' },
            props : { textContent : label},
            on : { click : function() {
              dispose();
              action(label);
            } }
          });
        }) );
      document.body.appendChild(contextmenu);
    });

    var calcEstInfo = function(baseDate, dayInPixel, task, taskEx) {

      var est = 0;
      if (task.grouped) {
        if (taskEx.simFinishDate) {
          var startTime = util.strToDate(taskEx.simStartDate).getTime();
          var finishTime = util.strToDate(taskEx.simFinishDate).getTime();
          est = ( (finishTime - startTime) /
              DAY_IN_MILLIS + 1) * opts.dayInHours;
        }
      } else {
        est = taskEx.simEst;
      }

      if (!est) {
        return null;
      }

      var hourOffset = 0;
      if (!task.grouped) {
        hourOffset = (opts.dayInHours - (taskEx.simStartHours || 0) ) /
          opts.dayInHours * dayInPixel;
      }

      var date = util.strToDate(taskEx.simStartDate);
      var left = Math.floor( (date.getTime() - baseDate.getTime() ) /
          DAY_IN_MILLIS * dayInPixel + hourOffset);

      var estWidth = Math.floor(est / opts.dayInHours * dayInPixel) - 1;

      var actWidth = 0;
      var currEst;

      if (task.grouped) {
        currEst = +(taskEx.currEst || taskEx.origEst || '0');
        if (currEst != 0) {
          actWidth = Math.floor(estWidth * +taskEx.elapsed / currEst);
        }
      } else {
        currEst = +(task.currEst || task.origEst || '0');
        if (currEst != 0) {
          actWidth = Math.floor(estWidth * +task.elapsed / currEst);
        }
      }
      return { left : left, estWidth : estWidth, actWidth : actWidth,
        assignee : task.grouped? taskEx.assignees.join(',') : task.assignee };
    };

    var createGraphCell = function(td) {

      var estBar = util.createSVGElement('rect',
          { attrs : { 'class' : '${prefix}-est-bar' } });
      var actBar = util.createSVGElement('rect',
          { attrs : { 'class' : '${prefix}-act-bar' } });
      var label = util.createSVGElement('text',
          { attrs : { 'class' : '${prefix}-graph-label' } });
      var pathS = util.createSVGElement('path',
          { attrs : { 'class' : '${prefix}-graph-path-s' } });
      var pathF = util.createSVGElement('path',
          { attrs : { 'class' : '${prefix}-graph-path-f' } });

      var style = {};

      var cs = window.getComputedStyle(td.$el);

      return {
        $el : util.createSVGElement('g',
          { style : { fontFamily : cs.fontFamily, fontSize : cs.fontSize } },
          [ estBar, actBar, label, pathS, pathF ]),
        _setStyle : function(k, v) {
          if (style[k] !== v) {
            this.$el.style[k] = style[k] = v;
          }
          return this;
        },
        setVisible : function(visible) {
          this._setStyle('display', visible? '' : 'none');
        },
        className : '',
        estInfo : {},
        setInfo : function(estInfo) {

          var changed = this.estInfo.left != estInfo.left ||
            this.estInfo.estWidth != estInfo.estWidth ||
            this.estInfo.actWidth != estInfo.actWidth ||
            this.estInfo.assignee != estInfo.assignee ||
            this.estInfo.pathS != estInfo.pathS ||
            this.estInfo.pathF != estInfo.pathF;

          if (changed) {

            util.set(pathS, { attrs : { d : estInfo.pathS } });
            util.set(pathF, { attrs : { d : estInfo.pathF } });
            util.set(estBar, { attrs : {
              x : estInfo.left, y : 4,
              width : Math.max(0, estInfo.estWidth), height : 11 } });
            util.set(actBar, { attrs : {
              x : estInfo.left, y : 7,
              width : Math.max(0, estInfo.actWidth), height : 5 } });
            util.set(label, { attrs : {
              x : estInfo.left + estInfo.estWidth + 2, y : 14 } });

            if (this.estInfo.assignee != estInfo.assignee) {
              label.textContent = estInfo.assignee;
            }

            this.estInfo = estInfo;
          }
        }
      };
    };

    var pathBuilder = function() {
      var path = '';
      return {
        moveTo : function(x, y) { path += 'M' + x + ' ' + y; return this; },
        lineTo : function(x, y) { path += 'L' + x + ' ' + y; return this; },
        close : function() { path += 'Z'; return this; },
        build : function() { return path; }
      };
    };

    var buildLinkPaths = function(td,
        linkedTaskRow, linkType, estInfo, linkedEstInfo) {

      var tableModel = td.tableModel;

      var numRows = tableModel.getNumRows();
      var linkedRow = linkedTaskRow + numRows[0];

      var pathY = 10;
      var pwGap = 8;
      var crossH = 7;
      var arrowW = 4;
      var arrowH = 3;

      var h = 0;
      var minRow = Math.min(td.row, linkedRow);
      var maxRow = Math.max(td.row, linkedRow);
      for (var i = minRow; i < maxRow; i += 1) {
        h += tableModel.getCellHeightAt(i + numRows[0]);
      }

      if (linkedRow < td.row) {
        h = -h;
        crossH = -crossH - 1;
      }

      var estRight = estInfo.left + estInfo.estWidth;
      var linkedEstRight = linkedEstInfo.left + linkedEstInfo.estWidth;

      // stroke
      var pbS = pathBuilder();

      // start
      if (linkType == 'SS' || linkType == 'FS') {
        pbS.moveTo(estInfo.left - arrowW, pathY);
      } else {
        pbS.moveTo(estRight + arrowW, pathY);
      }

      if (linkType == 'SS') {
        var minX = Math.min(estInfo.left, linkedEstInfo.left);
        pbS.lineTo(minX - pwGap, pathY);
        pbS.lineTo(minX - pwGap, pathY + h);
      } else if (linkType == 'FF') {
        var maxX =  Math.max(estRight, linkedEstRight);
        pbS.lineTo(maxX + pwGap, pathY);
        pbS.lineTo(maxX + pwGap, pathY + h);
      } else if (linkType == 'FS') {
        pbS.lineTo(estInfo.left - pwGap, pathY);
        if (linkedEstRight <= estInfo.left - pwGap) {
          pbS.lineTo(estInfo.left - pwGap, pathY + h);
        } else {
          pbS.lineTo(estInfo.left - pwGap, pathY + crossH);
          pbS.lineTo(linkedEstRight + pwGap, pathY + crossH);
          pbS.lineTo(linkedEstRight + pwGap, pathY + h);
        }
      } else if (linkType == 'SF') {
        pbS.lineTo(estRight + pwGap, pathY);
        if (estRight + pwGap <= linkedEstInfo.left) {
          pbS.lineTo(estRight + pwGap, pathY + h);
        } else {
          pbS.lineTo(estRight + pwGap, pathY + crossH);
          pbS.lineTo(linkedEstInfo.left - pwGap, pathY + crossH);
          pbS.lineTo(linkedEstInfo.left - pwGap, pathY + h);
        }
      }

      // end
      if (linkType == 'SF' || linkType == 'SS') {
        pbS.lineTo(linkedEstInfo.left, pathY + h);
      } else {
        pbS.lineTo(linkedEstRight, pathY + h);
      }

      // fill
      var pbF = pathBuilder();

      if (linkType == 'SS' || linkType == 'FS') {
        pbF.moveTo(estInfo.left - arrowW, pathY - arrowH);
        pbF.lineTo(estInfo.left, pathY);
        pbF.lineTo(estInfo.left - arrowW, pathY + arrowH);
        pbF.close();
      } else {
        pbF.moveTo(estRight + arrowW, pathY - arrowH);
        pbF.lineTo(estRight, pathY);
        pbF.lineTo(estRight + arrowW, pathY + arrowH);
        pbF.close();
      }

      return {
        pathS : pbS.build(),
        pathF : pbF.build(),
      }
    };

    var createFilterButton = function() {
      var size = 15;
      return util.createSVGElement('svg',
          { attrs : { class : '${prefix}-filter-button',
              width : size, height : size },
            style : { position : 'absolute', right : '2px', top : '2px' } },
          [
            util.createSVGElement('rect',
              { attrs : { width : size, height : size, rx:2, ry : 2 } }),
            util.createSVGElement('path',
              { attrs : { d : 'M2 4L7.5 12L13 4Z' } })
          ]);
    };

    var headerFactory = function(td) {

      var defaultRenderer = defaultCellRendererFactory(td);
      var tableModel = td.tableModel;
      var filterButton = null;

      return {
        render : function(cell) {
//          cell.value = ''
          if (filterButton == null && cell.filterEnabled) {
            filterButton = createFilterButton();
            td.$el.appendChild(filterButton);
          }
          defaultRenderer.render(cell);
        },
        beginEdit : function(cell) {
          return defaultRenderer.beginEdit(cell);
        },
        dispose : function() {
          defaultRenderer.dispose();
        }
      }
    };

    var graphFactory = function(td) {

      var renderGraph = function(cell) {

        var graphParams = cell.graphParams;
        if (graphCell == null) {
          graphCell = createGraphCell(td);
          tableBg.appendChild(graphCell.$el);
        }

        var task = graphParams.task;
        var taskEx = graphParams.taskEx;

        var estInfo = calcEstInfo(
            graphParams.baseDate, graphParams.dayInPixel,
            task, taskEx);

        if (estInfo) {

          var className = '${prefix}-graph';
          className += ' ${prefix}-indent' + task.indent;
          if (task.grouped) {
            className += ' ${prefix}-grouped';
          }
          if (graphCell.className != className) {
            graphCell.className = className;
            util.set(graphCell.$el,
                { attrs : { 'class' : graphCell.className } });
          }

          estInfo.path = '';

          if (task.linkedTaskId && task.linkType) {
            var linkedTaskRow = tableModel.getRowByTaskId(task.linkedTaskId);
            if (typeof linkedTaskRow == 'number') {
              var linkedViewRow = tableModel.getViewRows()[linkedTaskRow];
              var linkedTask = tableModel.getTaskAt(linkedViewRow);
              var linkedTaskEx = tableModel.getTaskExAt(linkedTaskRow);
              var linkedEstInfo = calcEstInfo(
                  graphParams.baseDate, graphParams.dayInPixel,
                  linkedTask, linkedTaskEx);
              if (linkedEstInfo) {
                var paths = buildLinkPaths(td, linkedTaskRow, task.linkType,
                    estInfo, linkedEstInfo);
                estInfo.pathS = paths.pathS;
                estInfo.pathF = paths.pathF;
              }
            }
          }

          graphCell.setInfo(estInfo);

          layoutGraphCell();
        }

        graphCell.setVisible(!!estInfo);
      };

      var layoutGraphCell = function() {
        var tableState = tableModel.dateTableState;
        var left = tableState.tableLeft;
        var top = tableState.tableTop;
        for (var col = tableState.minCol; col < td.col; col += 1) {
          left += tableModel.getCellWidthAt(col);
        }
        for (var row = tableState.minRow; row < td.row; row += 1) {
          top += tableModel.getCellHeightAt(row);
        }
        util.set(graphCell.$el, { attrs : {
          transform : 'translate(' + left + ' ' + top + ')' } });
      };

      var table = td.$el. // td
        parentNode. // tr
        parentNode. // tbody
        parentNode; // table
      var tableBg = table.parentNode.firstChild;
      var graphCell = null;

      var tableModel = td.tableModel;

      var defaultRenderer = defaultCellRendererFactory(td);

      return {
        render : function(cell) {
          defaultRenderer.render(cell);
          if (cell.graphParams) {
            renderGraph(cell);
          } else {
            if (graphCell) {
              graphCell.setVisible(false);
            }
          }
        },
        beginEdit : function(cell) {
          return defaultRenderer.beginEdit(cell);
        },
        dispose : function() {
          defaultRenderer.dispose();
          if (graphCell) {
            tableBg.removeChild(graphCell.$el);
            graphCell = null;
          }
        }
      }
    };

    table.model.on('contentwidthchange', function(event, detail) {

      this.setContentWidth(this.getContentWidth() + detail.deltaX);
      table.invalidate();

    }).on('cellwidthchange', function(event, detail) {

      this.setCellWidthAt(detail.col,
          this.getCellWidthAt(detail.col) + detail.deltaX);
      table.invalidate();

    });

    table.on('beforerender', function(event, detail) {

      var dateTableState = null;
      detail.tables.forEach(function(table) {
        if (table.tblRow == 1 && table.tblCol == 2) {
          dateTableState = table.tableState;
        }
      });

      this.model.dateTableState = dateTableState;
    });

    table.on('click', function(event, detail) {

      if (detail.originalEvent.which != 1) {
        return;
      }

      var numColumns = this.model.getNumColumns();
      var numRows = this.model.getNumRows();
      var row = detail.row;
      var col = detail.col;
      if (col < numColumns[0]) {
        if (row < numRows[0]) {
          
        } else if (row < numRows[0] + numRows[1]) {

          detail.originalEvent.preventDefault();

          var r = row - numRows[0];

          if (detail.originalEvent.ctrlKey) {
            if (this.model.getSelectedRows().indexOf(r) != -1) {
              this.model.setSelectedRows(this.model.getSelectedRows().
                  filter(function(row) { return row != r; }) );
            } else {
              this.model.setSelectedRows(
                  this.model.getSelectedRows().concat([r]) );
            }
          } else if (detail.originalEvent.shiftKey) {
            var selectedRows = this.model.getSelectedRows();
            if (selectedRows.length > 0) {
              var lastRow = selectedRows[selectedRows.length - 1];
              var min = Math.min(lastRow, r);
              var max = Math.max(lastRow, r);
              selectedRows = [];
              for (var rr = min; rr <= max; rr += 1) {
                selectedRows.push(rr);
              }
              this.model.setSelectedRows(selectedRows);
            } else {
              this.model.setSelectedRows([r]);
            }
          } else {
            this.model.setSelectedRows([r]);
          }

          this.invalidate();

        } else {
          
        }
        
      }
    }).on('hidegrid', function(event,detail) {
      var hidegrid = detail;
      table.tables.forEach(function(table) {
        if (table.tblRow == 1 && table.tblCol == 2) {
          table.setTableVisible(!hidegrid);
        }
      });
    });

    return table;
  };

  var getMessages = function() {

    var util = prLib.util;
    var i18n = prLib.i18n;

    util.extend(i18n.en.messages, {
      MAN_HOURS : 'Man Hours',
      ORIGINAL : 'Original',
      ACTUAL : 'Actual',
      WBS : 'WBS',
      TASK_ID : 'Task ID',
      TASK_NAME : 'Task Name',
      ASSIGNEE : 'Assignee',
      ORIG_EST : 'Orig Est',
      CURR_EST : 'Curr Est',
      ELAPSED : 'Elapsed',
      REMAIN : 'Remain',
      START_DATE : 'Start',
      FINISH_DATE : 'Finish',
      LINK : 'Link',
      LINK_TYPE : 'Type',
      LINKED_TASK : 'Task',

      INSERT_ROW : 'Insert Row',
      DELETE_ROW : 'Delete Row',
      MOVE_UP : 'Move Up',
      MOVE_DOWN : 'Move Down',
      INDENT_UP : 'Indent Up <',
      INDENT_DOWN : 'Indent Down >'
    });

    util.extend(i18n.ja.messages, {
      MAN_HOURS : '工数(h)',
      ORIGINAL : '予定',
      ACTUAL : '実績',
      WBS : 'WBS番号',
      TASK_ID : 'タスクID',
      TASK_NAME : 'タスク名',
      ASSIGNEE : '担当',
      ORIG_EST : '当初見積',
      CURR_EST : '現在見積',
      ELAPSED : '実績工数',
      REMAIN : '残工数',
      START_DATE : '開始日',
      FINISH_DATE : '完了日',
      LINK : 'リンク',
      LINK_TYPE : '種別',
      LINKED_TASK : 'タスク',

      INSERT_ROW : '行挿入',
      DELETE_ROW : '行削除',
      MOVE_UP : '上へ移動',
      MOVE_DOWN : '下へ移動',
      INDENT_UP : '一段上げる ←',
      INDENT_DOWN : '一段下げる →'
    });

    return i18n.getInstance().messages;
  };

  prLib.createPrTable = createPrTable;

}(window.prLib || (window.prLib = {}) );
