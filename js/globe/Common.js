define(["require", "exports"], function (require, exports) {
    "use strict";
    function linearMap(x, in_min, in_max, out_min, out_max) {
        return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
    }
    exports.linearMap = linearMap;
    function shuffleArray(array) {
        for (var i = array.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
        return array;
    }
    exports.shuffleArray = shuffleArray;
});
//# sourceMappingURL=Common.js.map