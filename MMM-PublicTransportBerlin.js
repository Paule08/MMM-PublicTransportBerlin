"use strict";

Module.register("MMM-PublicTransportBerlin", {
  // default values
  defaults: {
    name: "MMM-PublicTransportBerlin",  // The name of this module
    hidden: false,                      // Hide this module?
    stationId: "900000160003",          // The ID of the station
    //directionStationId: 0,              // The stationId of the next station in which direction departures should be shown
    ignoredStations: [],                // Which stations should be ignored? (comma-separated list of station IDs)
    ignoredLines: [],                   // Which lines should be ignored? (comma-separated list of line names)
    excludedTransportationTypes: "",    // Which transportation types should not be shown on the mirror? (comma-separated list of types) possible values: bus,tram,suburban,subway,ferry
    marqueeLongDirections: true,        // Use Marquee effect for long station names?
    travelTimeToStation: 10,            // How long do you need to walk/bike to the next Station?
    interval: 120000,                   // How often should the table be updated in ms?
    departureMinutes: 30,               // For how many minutes should departures be shown?
    showColoredLineSymbols: true,       // Want colored line symbols?
    useColorForRealtimeInfo: true,      // Want colored real time information (delay, early)?
    showTableHeaders: true,             // Show table headers?
    showTableHeadersAsSymbols: true,    // Table Headers as symbols or written?
    maxUnreachableDepartures: 3,        // How many unreachable departures should be shown?
    maxReachableDepartures: 7,          // How many reachable departures should be shown?
    fadeUnreachableDepartures: true,    // Should unreachable departures be faded away from the reachable departures line?
    fadeReachableDepartures: true,      // Should reachable departures be faded away from the reachable departures line?
    fadePointForReachableDepartures: 0.25, // The point to start fading the reachable departures
    excludeDelayFromTimeLabel: false     // Should the delay time be excluded from the time label?
  },

  start: function () {
    Log.info("Starting module: " + this.name);

    this.departuresArray = [];
    this.stationName = "";
    this.loaded = false;
    this.error = {};

    // If the stationId is not a string, we'll print a warning
    if (typeof this.config.stationId === "number") {
      let warning = "MMM-PublicTransportBerlin deprecation warning: The stationId must be a String! Please check your configuration!";
      Log.warn(warning);
      console.log(warning);
    }

    // Provide backwards compatibility for refactoring of config.delay to config.travelTimeToStation
    if (this.config.delay) {
      let warning = "MMM-PublicTransportBerlin deprecation warning: The delay option has been renamed to travelTimeToStation. Please change your configuration!";
      Log.warn(warning);
      console.log(warning);

      this.config.travelTimeToStation = this.config.delay;
    }

    this.sendSocketNotification("CREATE_FETCHER", this.config);

    if(this.config.travelTimeToStation < 0) {
      this.config.travelTimeToStation = 0;
    }

    if(typeof this.config.ignoredLines === "undefined") {
      this.config.ignoredLines = [];
    }

    // set minimum interval to 30 seconds
    if (this.config.interval < 30000) {
      this.config.interval = 30000;
    }

    setInterval(() => {
      // If the module started without getting the stationName for some reason, we try to get the stationName again
      if(this.loaded && this.stationName === ""){
          this.sendSocketNotification("STATION_NAME_MISSING_AFTER_INIT", this.config.stationId);
      }

      this.sendSocketNotification("GET_DEPARTURES", this.config.stationId);
    }, this.config.interval)
  },

  getDom: function () {
    let wrapper = document.createElement("div");
    wrapper.className = "ptbWrapper";

    // Handle loading sequence at init time
    if (this.departuresArray.length === 0 && !this.loaded) {
      wrapper.innerHTML = (this.loaded) ? this.translate("EMPTY") : this.translate("LOADING");
      wrapper.className = "small light dimmed";
      return wrapper;
    }

    let heading = document.createElement("header");
    heading.innerHTML = this.stationName;
    wrapper.appendChild(heading);

    // Handle departure fetcher error and show it on the screen
    if (Object.keys(this.error).length > 0) {
      let errorContent = document.createElement("div");
      errorContent.innerHTML = this.translate("FETCHER_ERROR") + ": " + JSON.stringify(this.error.message) + "<br>";
      errorContent.innerHTML += this.translate("NO_VBBDATA_ERROR_HINT");
      errorContent.className = "small light dimmed errorCell";
      wrapper.appendChild(errorContent);
      return wrapper;
    }

    // Table header
    let table = document.createElement("table");
    table.className = "ptbTable small light";

    let tHead = document.createElement("thead");

    let headerRow = document.createElement("tr");

    // Cell for departure time
    let headerTime = document.createElement("td");
    headerTime.className = "centeredTd";

    if (this.config.showTableHeadersAsSymbols) {
      let timeIcon = document.createElement("span");
      timeIcon.className = "fa fa-clock-o";
      headerTime.appendChild(timeIcon);
    } else {
      headerTime.innerHTML = this.translate("WHEN");
    }

    headerRow.appendChild(headerTime);

    // Cell for travelTimeToStation time
    let delayTime = document.createElement("td");
    delayTime.innerHTML = "&nbsp;";
    headerRow.appendChild(delayTime);

    // Cell for line symbol
    let headerLine = document.createElement("td");
    headerLine.className = "centeredTd";

    if (this.config.showTableHeadersAsSymbols) {
      let lineIcon = document.createElement("span");
      lineIcon.className = "fa fa-tag";
      headerLine.appendChild(lineIcon);
    } else {
      headerLine.innerHTML = this.translate("LINE");
    }

    headerRow.appendChild(headerLine);

    // Cell for direction
    let headerDirection = document.createElement("td");
    headerDirection.className = "centeredTd";

    if (this.config.showTableHeadersAsSymbols) {
      let directionIcon = document.createElement("span");
      directionIcon.className = "fa fa-exchange";
      headerDirection.appendChild(directionIcon);
    } else {
      headerDirection.innerHTML = this.translate("DIRECTION");
    }

    headerRow.appendChild(headerDirection);

    headerRow.className = "bold dimmed";

    if (this.config.showTableHeaders) {
      tHead.appendChild(headerRow);
    }

    table.appendChild(tHead);

    // Create table body from data
    let tBody = document.createElement("tbody");

    // Handle empty departures array
    if (this.departuresArray.length === 0) {
      let row = this.getNoDeparturesRow(this.translate("NO_DEPARTURES_AVAILABLE"));

      tBody.appendChild(row);
      table.appendChild(tBody);
      wrapper.appendChild(table);

      return wrapper;
    }

    // handle travelTimeToStation === 0
    if (this.config.travelTimeToStation === 0) {
        this.departuresArray.forEach((current, i) => {
            if (i < this.config.maxReachableDepartures) {
                let row = this.getRow(current);
                tBody.appendChild(row);

                // fading
                if (this.config.fadeReachableDepartures && this.config.fadePointForReachableDepartures < 1) {
                    if (this.config.fadePointForReachableDepartures < 0) {
                        this.config.fadePointForReachableDepartures = 0;
                    }
                    let startingPoint = this.config.maxReachableDepartures * this.config.fadePointForReachableDepartures;
                    let steps = this.config.maxReachableDepartures - startingPoint;
                    if (i >= startingPoint) {
                        let currentStep = i - startingPoint;
                        row.style.opacity = 1 - (1 / steps * currentStep);
                    }
                }
            }
        });
      // handle travelTimeToStation > 0
    } else {
        this.getFirstReachableDeparturePosition().then((reachableDeparturePos) => {
            this.departuresArray.forEach((current, i) => {

                if (i >= reachableDeparturePos - this.config.maxUnreachableDepartures
                    && i < reachableDeparturePos + this.config.maxReachableDepartures) {

                    // insert rule to separate reachable departures
                    if (i === reachableDeparturePos
                        && reachableDeparturePos !== 0
                        && this.config.maxUnreachableDepartures !== 0) {

                        let ruleRow = document.createElement("tr");

                        let ruleTimeCell = document.createElement("td");
                        ruleRow.appendChild(ruleTimeCell);

                        let ruleCell = document.createElement("td");
                        ruleCell.colSpan = 3;
                        ruleCell.className = "ruleCell";
                        ruleRow.appendChild(ruleCell);

                        tBody.appendChild(ruleRow);
                    }

                    // create standard row
                    let row = this.getRow(current);

                    // fading for entries before "travelTimeToStation rule"
                    if (this.config.fadeUnreachableDepartures && this.config.travelTimeToStation > 0) {
                        let steps = this.config.maxUnreachableDepartures;
                        if (i >= reachableDeparturePos - steps && i < reachableDeparturePos) {
                            let currentStep = reachableDeparturePos - i;
                            row.style.opacity = 1 - ((1 / steps * currentStep) - 0.2);
                        }
                    }

                    // fading for entries after "travelTimeToStation rule"
                    if (this.config.fadeReachableDepartures && this.config.fadePointForReachableDepartures < 1) {
                        if (this.config.fadePointForReachableDepartures < 0) {
                            this.config.fadePointForReachableDepartures = 0;
                        }
                        let startingPoint = this.config.maxReachableDepartures * this.config.fadePointForReachableDepartures;
                        let steps = this.config.maxReachableDepartures - startingPoint;
                        if (i >= reachableDeparturePos + startingPoint) {
                            let currentStep = (i - reachableDeparturePos) - startingPoint;
                            row.style.opacity = 1 - (1 / steps * currentStep);
                        }
                    }

                    tBody.appendChild(row);
                }
            });
        }, (message) => {
            let row = this.getNoDeparturesRow(message);
            tBody.appendChild(row);
        });
    }

    table.appendChild(tBody);

    wrapper.appendChild(table);

    return wrapper;
  },

  getNoDeparturesRow: function (message) {
    let row = document.createElement("tr");
    let cell = document.createElement("td");
    cell.colSpan = 4;

    cell.innerHTML = message;

    row.appendChild(cell);

    return row;
  },

  getRow: function (current) {
    let currentWhen = moment(current.when);
    let delay = this.convertDelayToMinutes(current.delay);

    if (this.config.excludeDelayFromTimeLabel) {
      currentWhen = this.getDepartureTimeWithoutDelay(currentWhen, delay);
    }

    let row = document.createElement("tr");

    let timeCell = document.createElement("td");
    timeCell.className = "centeredTd timeCell";
    timeCell.innerHTML = currentWhen.format("HH:mm");
    row.appendChild(timeCell);

    let delayCell = document.createElement("td");
    delayCell.className = "delayTimeCell";

    if (delay > 0) {
      delayCell.innerHTML = "+" + delay + " ";
      if (this.config.useColorForRealtimeInfo) {
          delayCell.style.color = "red";
      }
    } else if (delay < 0) {
      delayCell.innerHTML = delay + " ";
      if (this.config.useColorForRealtimeInfo) {
          delayCell.style.color = "green";
      }
    } else if (delay === 0) {
      delayCell.innerHTML = "";
    }

    row.appendChild(delayCell);

    let lineCell = document.createElement("td");
    let lineSymbol = this.getLineSymbol(current);
    lineCell.className = "centeredTd noPadding lineCell";

    lineCell.appendChild(lineSymbol);
    row.appendChild(lineCell);

    let directionCell = document.createElement("td");
    directionCell.className = "directionCell";

    if (this.config.marqueeLongDirections && current.direction.length >= 26) {
      directionCell.className = "directionCell marquee";
      let directionSpan = document.createElement("span");
      directionSpan.innerHTML = current.direction;
      directionCell.appendChild(directionSpan);
    } else {
      directionCell.innerHTML = this.trimDirectionString(current.direction);
    }

    row.appendChild(directionCell);

    // Add cancelled class to this row if the trip was cancelled
    if (current.cancelled) {
        row.classList.add("cancelled");
    }

    return row;
  },

  getDepartureTimeWithoutDelay: function (departureTime, delay) {
    if (delay > 0) {
      departureTime.subtract(delay, "minutes");
    } else if (delay < 0) {
      departureTime.add(Math.abs(delay), "minutes");
    }

    return departureTime;
  },

  getFirstReachableDeparturePosition: function () {
    let now = moment();
    let nowWithDelay = now.add(this.config.travelTimeToStation, "minutes");

    return new Promise((resolve, reject) => {
      this.departuresArray.forEach((current, i, depArray) => {

        let currentWhen = moment(current.when);

        if (depArray.length > 1 && i < depArray.length - 1) {

          let nextWhen = moment(depArray[i + 1].when);
          if ((currentWhen.isBefore(nowWithDelay) && nextWhen.isSameOrAfter(nowWithDelay))
              || (i === 0 && nextWhen.isSameOrAfter(nowWithDelay))) {

              resolve(i);
          }
        } else if (i === depArray.length - 1 && currentWhen.isBefore(nowWithDelay)) {
          reject(this.translate("NO_REACHABLE_DEPARTURES"));
        } else {
          reject(this.translate("NO_REACHABLE_DEPARTURES"));
        }
      });
    });
  },

  trimDirectionString: function (string) {
    let dirString = string;

    if (dirString.indexOf(",") > -1) {
      dirString = dirString.split(",")[0]
    }

    let viaIndex = dirString.search(/( via )/g);
    if (viaIndex > -1) {
      dirString = dirString.split(/( via )/g)[0]
    }

    return dirString
  },

  getLineSymbol: function (product) {
    let symbol = document.createElement("div");

    if (product.type === "express") {
      if (product.name === "LOCOMORE")
        symbol.innerHTML = "LOC";
      else
        symbol.innerHTML = "ICE";
    } else {
      symbol.innerHTML = product.name;
    }

    symbol.classList.add(product.cssClass);
    symbol.classList.add("xsmall");

    if (this.config.showColoredLineSymbols) {
      symbol.style.backgroundColor = product.color;
    } else {
      symbol.style.backgroundColor = "#333333";
    }

    return symbol;
  },

  convertDelayToMinutes: function (delay) {
      return Math.floor((((delay % 31536000) % 86400) % 3600) / 60);
  },

  getTranslations: function() {
    return {
      en: "translations/en.json",
      de: "translations/de.json"
    }
  },

  getStyles: function () {
    return [
      "style.css",
      "font-awesome.css"
    ];
  },

  getScripts: function () {
    return [
      "moment.js"
    ];
},

socketNotificationReceived: function (notification, payload) {
  if (notification === "FETCHER_INIT") {
    if (payload.stationId === this.config.stationId) {
      this.stationName = payload.stationName;
      this.loaded = true;
      }
    }

    if (notification === "DEPARTURES") {
      if (payload.stationId === this.config.stationId) {
        this.loaded = true;
        // Empty error object
        this.error = {};
        // Proceed with normal operation
        this.departuresArray = payload.departuresArray;
        this.updateDom(3000);
      }
    }

    if (notification === "FETCH_ERROR") {
      if (payload.stationId === this.config.stationId) {
        this.loaded = true;
        this.error = payload;
        this.updateDom(3000);
      }
    }
  }
});
