'use strict';

!function() {

  var util = prLib.util;
  var createPrTable = prLib.createPrTable;

  util.$(window).on('load', function() {

    util.extend(this, {
      $refs : {
        main : document.getElementById('main'),
        back : document.getElementById('back'),
        toolbar : document.getElementById('toolbar'),
        toggleDisplay : document.getElementById('toggleDisplay'),
        toggleDate : document.getElementById('toggleDate'),
        test : document.getElementById('test'),
        appData : document.getElementById('appData')
      },
      lastSize : null,
      appData : appData,
      showMain : false,
      dateSpecIndex : 0
    });

    var table = createPrTable();
    table.model.tasks = this.appData.tasks;
    table.model.userSettings = this.appData.userSettings;
    this.$refs.main.appendChild(table.$el);

    var layout = function() {

      var size = { width : window.innerWidth, height : window.innerHeight };

      if (this.lastSize == null ||
          this.lastSize.width != size.width ||
          this.lastSize.height != size.height) {
        var height = this.$refs.toolbar.offsetHeight;
        util.set(table.$el, {
          style : {
            width : size.width + 'px',
            height : Math.max(0, size.height - height) + 'px'
          }
        });
        table.invalidate();
        this.lastSize = size;
      }

      window.setTimeout(layout, 100);

    }.bind(this);

    layout();

    var toggleDisplay = function() {

      if (this.showMain) {
        var appData = {
          tasks : table.model.getTrimedTasks(),
          userSettings : table.model.userSettings
        };
        this.$refs.appData.value = 'var appData = ' +
          JSON.stringify(appData,null,2) +
          ';\n';
      } else {
        table.invalidate();
      }

      this.showMain = !this.showMain;

      this.$refs.main.style.display = this.showMain? '' : 'none';
      this.$refs.back.style.display = (!this.showMain)? '' : 'none';

    }.bind(this);

    var toggleDate = function() {
      this.dateSpecIndex = 1 - this.dateSpecIndex;
      table.model.setDateSpecIndex(this.dateSpecIndex);
      table.invalidate();
    }.bind(this);

    var test = function() {
      this.hideGrid = !this.hideGrid;
      table.trigger('hidegrid', this.hideGrid);
    }.bind(this);

    util.$(this.$refs.toggleDisplay).on('click', function() {
      toggleDisplay();
    } );

    util.$(this.$refs.toggleDate).on('click', function() {
      toggleDate();
    } );

    util.$(this.$refs.test).on('click', function() {
      test();
    } );

    toggleDisplay();

  }.bind({}) );

}();
