import Common = require("./Common")

/*
 Lots borrowed from suncalc.js
 */
"use strict";

const PI = Math.PI,
    sin = Math.sin,
    cos = Math.cos,
    asin = Math.asin,
    rad = PI / 180,
    e = rad * 23.439281,
    dayMs = 1000 * 60 * 60 * 24,
    J1970 = 2440588,
    J2000 = 2451545;

function toJulian(date) {
    return date.valueOf() / dayMs - 0.5 + J1970;
}

function toDays(date) {
    return toJulian(date) - J2000;
}

function declination(l, b) {
    return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l));
}

function solarMeanAnomaly(d) {
    return rad * (357.5291 + 0.98560028 * d);
}

function eclipticLongitude(M) {
    var C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)), // equation of center
        P = rad * 102.9372;
    return M + C + P + PI;
}

export class Calculator {
    secondsToday:number;
    eclipticLng:number;

    constructor(public currentDate:Date) {
        const days = toDays(currentDate),
            sMA = solarMeanAnomaly(days);

        var today = new Date();
        today = new Date(today.getTime() + today.getTimezoneOffset() * 60000); // Convert to UTC

        this.secondsToday = today.getSeconds() + (60 * today.getMinutes()) + (60 * 60 * today.getHours());
        this.eclipticLng = eclipticLongitude(sMA)
    }

    getDeclanation() {
        return declination(this.eclipticLng, 0)
    }

    getRightAscension() {
        return Common.linearMap(this.secondsToday, 0, 86400, 0, 2 * Math.PI)
    }
}
