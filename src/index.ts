import { Context, Logger, Schema} from 'koishi'
import { DataUpdater } from './DataUpdater'; 
import { MCPinger } from './MCPinger'; 

export const name = 'mc-search'

//配置构型
export interface Config {
  IsSendImage: boolean
  DefaultSearchInfo: any
  Authority: number
  Interval: number
}

export const Config: Schema<Config> = Schema.object({
  Authority: Schema.number().default(0).description('默认指令权限等级'),
  DefaultSearchInfo: Schema.array(Schema.object({
    昵称:Schema.string(),
    IP: Schema.string(),
    端口: Schema.string(),
    群号: Schema.string()
  })).default([{
    昵称:"殖民地",
    IP: 'mc.mcpolaris.cn',
    端口: '31219',
    群号: '778674403'
  }]).role('table').description('设置默认查询的服务器地址'),
  IsSendImage: Schema.boolean().default(false).description('设置默认发送信息是否为图片格式,开启该功能前请检查puppeteer服务是否正确开启,图画转换功能依赖于此插件！'),
  Interval: Schema.number().default(10000).description('自动更新数据库中默认房间信息间隔(ms),重新配置了默认内容之后得要重启koishi!'),
})

export async function apply(ctx: Context,config:Config) {
  const dataUpdater = new DataUpdater(config.Interval); 
  // 初始化存储群号和sendMsg的字典
  let serverStatusDict = {};
  dataUpdater.startUpdating(async ()=>{
    serverStatusDict = await updateSendMsg();
    // const Pinger2 = new MCPinger(); 
    // Pinger2.Ping("cn.nekoland.top",25565);
  })

  // 更新sendMsg并存入字典
  async function updateSendMsg() {
    let statusDict = {}; // 用于存储群号和sendMsg的字典

    // 创建一个字典来存储每个群号的计数器
    const counterDict = {};

    for (const SearchInfo of config.DefaultSearchInfo) {
        try {
            const Pinger = new MCPinger();
            const sendMsg = await Pinger.Ping(SearchInfo.IP, SearchInfo.端口);

            // 初始化该群号的计数器，如果尚未存在
            if (counterDict[SearchInfo.群号] == undefined) {
                counterDict[SearchInfo.群号] = 1;
            }

            // 拼接服务器名，前面加上序号
            const serverInfo = `${counterDict[SearchInfo.群号]}. [ ${SearchInfo.昵称} ]${sendMsg}`;

            // 如果群号已存在，将新信息追加到现有消息中
            if (statusDict[SearchInfo.群号] != undefined) {
                statusDict[SearchInfo.群号] += `\n${serverInfo}`;
            } else {
                statusDict[SearchInfo.群号] = serverInfo;
            }

            // 递增该群号的计数器
            counterDict[SearchInfo.群号]++;
        } catch (error) {
            // 捕获并处理异常，记录错误日志或输出错误消息
            ctx.logger.error(`群号 ${SearchInfo.群号}`, error)
            continue;
        }
    }
    return statusDict;
  }

  ctx.command("查MC").action(async (Session)=>{
    const guildId = Session.session.guildId;
    const relevantMsg = serverStatusDict[guildId];
    return relevantMsg
  })

  ctx.on('dispose', () => {
    dataUpdater.stopUpdating();
  });
}
