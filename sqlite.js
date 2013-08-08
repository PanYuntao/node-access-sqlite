/**
 * Created with panyuntao.
 * User: panyuntao
 * Date: 13-6-24
 * Time: 上午9:38
 * Nodejs数据库访问类库*
 * 支持macos、windows
 * 支持数据库加密
 * 注意事项:
 * 1.不知道多线程操作，一定要保证同时只有一个数据库连接open,也就是说你的SQLiteConnection同时打开(Open)了两个相同的
 * Data source，会出现code 21错误。
 * 2.如果出现异常 “The database file is locked”的话，记住sqlite 的原则:读写分离,读的时候，不能写，写的时候，不能读,
 * 例如读了一个table 的数据用的 datareader 对象，而此对象没释放，又继续进行插入或修改操作,这样会出错。
 */

/**
 * Module dependencies.
 */
var fs = require('fs')
    , ref = require('ref')
    , ffi = require('ffi')
    , async = require('async')
    , ArrayType = require('ref-array')

/*模块函数*/
exports = module.exports =
    function sqlite3(dbname,Encryptkey) {

        var sqlite3 = 'void' // `sqlite3` is an "opaque" type, so we don't know its layout
            , sqlite3Ptr = ref.refType(sqlite3)
            , sqlite3PtrPtr = ref.refType(sqlite3Ptr)
            , sqlite3_exec_callback = 'pointer' // TODO: use ffi.Callback when #88 is implemented
            , stringPtr = ref.refType('string')
            , stringPtrPtr = ref.refType(stringPtr) //string **




        // create FFI'd versions of the sqlite3 function we're interested in
        var SQLite3 = ffi.Library(__dirname+'/sqlite3', {
            'sqlite3_libversion': ['string', []],
            'sqlite3_open': ['int', ['string', sqlite3PtrPtr]],
            'sqlite3_key': ['int', [sqlite3PtrPtr, 'string', 'int']],
            'sqlite3_close': ['int', [sqlite3Ptr]],
            'sqlite3_changes': ['int', [sqlite3Ptr]],
            'sqlite3_exec': ['int', [sqlite3Ptr, 'string', sqlite3_exec_callback, 'void *', stringPtr]],
            'sqlite3_get_table': ['int',[sqlite3Ptr,'string',stringPtrPtr,'int *','int *',stringPtr] ]
        })

        /*
        * 执行sql语句，返回Bool（默认启用事务,语句执行失败后自动回滚）
        * 参数：
        * @callback   回调函数，参数为返回结果
        * @sql        sql语句
        * */
        this.sql_execute= function (callback, sql) {
            var db = ref.alloc(sqlite3PtrPtr)
            SQLite3.sqlite3_open(dbname, db)
            db = db.deref()
            //DB Encrypt
            //var ires = SQLite3.sqlite3_key(db, Encryptkey, Encryptkey.length)
            var ires = SQLite3.sqlite3_exec(db,  'begin transaction ; '+ sql, null, null, null);

             if(ires==0)
             {
                SQLite3.sqlite3_exec(db, 'commit transaction ;', null, null, null);
                SQLite3.sqlite3_close(db);
                callback(true);
             }
             else
             {
                SQLite3.sqlite3_exec(db, 'rollback transaction ;', null, null,null)
                SQLite3.sqlite3_close(db);
                callback("执行失败，exec错误码: "+ires);
              }
        }

        /*
         * 执行异步sql语句，返回结果集合（无事务）
         * 参数： callback 回调函数，结果集合
        * */
        this.sql_query = function (callback, sql) {
            var db = ref.alloc(sqlite3PtrPtr)
            var resopen = SQLite3.sqlite3_open(dbname, db)
            if(resopen!=0)
            {callback("数据操作失败，open错误码: "+resopen);}
            db = db.deref()
            // var ires =  SQLite3.sqlite3_key(db, Encryptkey, Encryptkey.length)
            var rmptable = [];
            var datacallback = ffi.Callback('int', ['void *', 'int',stringPtr , stringPtr], function (tmp, cols, argv, colv) {
                var string = ref.types.CString
                // define the "string[]" type
                var StringArray = ArrayType(string)
                var arraycolv = StringArray.untilZeros(colv)
                var arrayargv = StringArray.untilZeros(argv)
                var objrow={}
                for (var i = 0; i < cols; i++) {
                    var colName =arraycolv[i]
                    var colData =arrayargv[i]
                    objrow[colName] = colData

                }
                rmptable.push(objrow);
                return 0
            })

            SQLite3.sqlite3_exec.async(db, sql, datacallback, null, null, function (err, ret) {
                if (err) {throw err
                //console.log(err)
                }
                if(ret!=0)
                {callback("数据操作失败，exec错误码: "+ret);}
                else
                {callback(rmptable); }

                SQLite3.sqlite3_close(db)

            }) ;
        }

        /*
         * 执行同步sql语句，返回结果集合（无事务）
         * 参数： callback 回调函数，结果集合
         * */
        this.sql_querysync = function (sql) {
            try {
                //console.log(sql)
               var db = ref.alloc(sqlite3PtrPtr)
                var resopen = SQLite3.sqlite3_open(dbname, db)
                if(resopen!=0)
                {callback("数据操作失败，open错误码: "+resopen);}
                db = db.deref()
                // var ires =  SQLite3.sqlite3_key(db, Encryptkey, Encryptkey.length)
                var tmptable = [];
                //sqlite返回结果集buffer
                var dbresult = ref.alloc(stringPtrPtr)
                //返回结果集行数
                var nrow = ref.alloc('int')
                //返回结果集列数
                var ncol = ref.alloc('int')
                var ires =SQLite3.sqlite3_get_table(db,sql,dbresult,nrow,ncol,null)
                var irow=nrow.deref()
                var icol=ncol.deref()
               
               if(ires!=0)
               {
                   return "数据查询失败，exec错误码: "+ires
               }
               //构造返回结果
               if(irow>0 && icol>0)
               {
                   //结果集buffer解析第一维数组
                   var stringptrArray = ArrayType(stringPtr)
                   var dataarray = stringptrArray.untilZeros(dbresult.deref())
                
                   var rowbuffer =dataarray['buffer'];
                  
                   //解析第二维数组（数据格式为前ncol为列名称，ncol+1开始为数据，数组末尾包含函数及相关对象）
                   var string =ref.types.CString
                   var stringArray =ArrayType(string)
                   var datarow =stringArray.untilZeros(rowbuffer)
  
                   //列名数组
                   var colarray = [];
                   for(var i=0; i<icol ; i++)
                   {
                       colarray.push(datarow[i])
                   }
                   var rcol =icol;//数组第icol元素开始为数据元素
                   //构造数据行
                   for(var j=0;j<irow;j++)
                   {
                       var objrow={}
                       for(var k=0; k<icol ; k++)
                       {
                           objrow[colarray[k]]=datarow[rcol]
                           rcol++;
                       }
                       tmptable.push(objrow)
                   }
               }
                SQLite3.sqlite3_close(db)
                return tmptable;
            } catch (err) {
                console.log(err)
                SQLite3.sqlite3_close(db)
                return "数据查询失败，error: "+err
            }
        }
    }


