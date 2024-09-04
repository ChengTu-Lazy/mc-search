export class DataUpdater {
    private intervalId: NodeJS.Timeout | null = null;
  
    // 定义一个字典来存储 JSON 数据
    public serverDataStore: { [key: string]: any } = {};
  
    constructor(private updateInterval: number) {
      // 构造函数中设置更新间隔时间
    }
  
    // 启动定时更新，支持异步回调函数
    startUpdating(callback: () => Promise<void>) {
      if (this.intervalId) {
        console.log("Updating is already started.");
        return;
      }
  
      this.intervalId = setInterval(() => {
        this.updateData(callback);
      }, this.updateInterval);
    }
  
    // 停止定时更新
    stopUpdating() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    }
  
    // 更新数据的方法，使用异步回调函数
    private async updateData(callback: () => Promise<void>) {
      try {
        // 等待异步回调函数完成
        await callback();
      } catch (error) {
        console.error("Failed to update data:", error);
      }
    }
  }
  