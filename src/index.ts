import { Context, Logger, Schema } from 'koishi'
import { MCPinger } from './MCPinger';

export const name = 'mc-search'

//配置构型
export interface Config {
  DefaultSearchInfo: any
}

export const Config: Schema<Config> = Schema.object({
  DefaultSearchInfo: Schema.array(Schema.object({
    昵称: Schema.string(),
    IP: Schema.string(),
    端口: Schema.string(),
    群号: Schema.string()
  })).default([{
    昵称: "殖民地",
    IP: 'mc.mcpolaris.cn',
    端口: '31219',
    群号: '778674403'
  }]).role('table').description('设置默认查询的服务器地址'),
})

export async function apply(ctx: Context, config: Config) {

  async function getSendMsg(guildId: string) {
    let statusDict = {}; // 用于存储群号和sendMsg的字典

    // 创建一个字典来存储每个群号的计数器
    const counterDict = {};

    // 过滤出当前群组的服务器信息
    const currentGroupInfo = config.DefaultSearchInfo.filter(info => info.群号 === guildId);
    
    for (const SearchInfo of currentGroupInfo) {
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

  ctx.command("mc-search").alias("查MC").action(async (Session) => {
    const guildId = Session.session.guildId;
    try {
      const statusDict = await getSendMsg(guildId);
      return statusDict[guildId];
    } catch (error) {
      ctx.logger.error('查询失败', error);
      return '查询服务器状态失败';
    }
  });
}
