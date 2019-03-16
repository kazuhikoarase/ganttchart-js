//
// ganttchart - app
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

//
// ganttchart - lib
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

//
// ganttchart - node glue
// @author Kazuhiko Arase
// Licensed under MIT LICENSE
//

'use strict';

!function(prlib) {
  if (typeof exports === 'object') {
    module.exports = prlib;
  }
}(window.prLib || (window.prLib = {}) );

//# sourceMappingURL=ganttchart.js.map
