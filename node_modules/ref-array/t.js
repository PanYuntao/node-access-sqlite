
var Array = require('./')

var ArrayOfTriangles = Array(Array('char', 3), 100)
var a = new ArrayOfTriangles()
a[0][0] = 0
a[0][1] = 69
a[0][2] = -69
console.log(a)
console.log(a.buffer.length)
