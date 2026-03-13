import * as lark from '@larksuiteoapi/node-sdk';
import type { BitableConfig } from '../types.js';

/**
 * 解析「已有多维表格」输入，支持：
 * - 多维表格 URL：https://xxx.feishu.cn/base/<app_token> 或 ?table=<table_id>
 * - 仅 App Token：<app_token>
 * - App Token + Table ID：<app_token> <table_id> 或 <app_token>,<table_id>
 */
export function parseBitableInput(input: string): { appToken: string; tableId?: string; url?: string } {
  const raw = input.trim();
  if (!raw) {
    throw new Error('请输入多维表格 URL 或 App Token');
  }

  // URL：https://xxx.feishu.cn/base/AppToken 或 ...?table=TableId
  const urlMatch = raw.match(/^https?:\/\/[^/]+\/base\/([A-Za-z0-9_-]+)(?:\?([^#]*))?/);
  if (urlMatch) {
    const appToken = urlMatch[1]!;
    const query = urlMatch[2] || '';
    const tableMatch = query.match(/(?:^|&)table=([A-Za-z0-9_-]+)/);
    const tableId = tableMatch ? tableMatch[1] : undefined;
    const url = raw.split('?')[0] ?? `https://feishu.cn/base/${appToken}`;
    return { appToken, tableId, url };
  }

  // 纯 token 或 "token table_id"
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  const appToken = parts[0]!;
  const tableId = parts[1];
  return { appToken, tableId };
}

export class BitableClient {
  private client: lark.Client;
  private appToken: string;
  private tableId: string;

  constructor(appId: string, appSecret: string, config: BitableConfig) {
    this.client = new lark.Client({
      appId,
      appSecret,
      appType: lark.AppType.SelfBuild,
      loggerLevel: lark.LoggerLevel.error,
    });
    this.appToken = config.appToken;
    this.tableId = config.tableId;
  }

  getClient(): lark.Client {
    return this.client;
  }

  getAppToken(): string {
    return this.appToken;
  }

  getTableId(): string {
    return this.tableId;
  }

  /**
   * 创建多维表格 app，并返回自动生成的默认表 ID。
   * 飞书创建 app 时会自动生成一个默认 table，通过 default_table_id 直接获取，
   * 无需再单独调用 createTable。
   */
  async createBitable(name: string): Promise<{ appToken: string; tableId: string; url: string }> {
    const res = await this.client.bitable.app.create({
      data: { name, is_advanced: false } as any,
    });
    const app = (res as any).data?.app;
    if (!app?.app_token) {
      throw new Error(`创建多维表格失败，响应: ${JSON.stringify(res)}`);
    }
    return {
      appToken: app.app_token as string,
      tableId: app.default_table_id as string,
      url: app.url as string,
    };
  }

  /**
   * 使用已有多维表格：校验权限并解析出 appToken、tableId、url。
   * 若未提供 tableId，则取该 base 下第一个数据表。
   */
  async useExistingBitable(
    appToken: string,
    tableId?: string,
    fallbackUrl?: string,
  ): Promise<{ appToken: string; tableId: string; url: string }> {
    let resolvedTableId = tableId;
    if (!resolvedTableId) {
      const res = await this.client.bitable.appTable.list({
        path: { app_token: appToken },
        params: { page_size: 1 },
      } as any);
      const items = (res as any).data?.items;
      if (!items?.length) {
        throw new Error('该多维表格下没有数据表，请先新建一个数据表或传入 table_id');
      }
      resolvedTableId = items[0].table_id ?? undefined;
    }
    if (!resolvedTableId) {
      throw new Error('无法获取数据表 ID');
    }

    // 校验：拉取字段列表确认有权限
    await this.listFields(appToken, resolvedTableId);

    const url = fallbackUrl ?? `https://feishu.cn/base/${appToken}`;
    return { appToken, tableId: resolvedTableId, url };
  }

  /**
   * 获取表格所有字段列表
   */
  async listFields(
    appToken: string,
    tableId: string,
  ): Promise<Array<{ field_id: string; field_name: string; type: number; is_primary: boolean }>> {
    const res = await this.client.bitable.appTableField.list({
      path: { app_token: appToken, table_id: tableId },
    });
    return ((res as any).data?.items ?? []) as Array<{
      field_id: string;
      field_name: string;
      type: number;
      is_primary: boolean;
    }>;
  }

  /**
   * 更新字段
   */
  async updateField(
    appToken: string,
    tableId: string,
    fieldId: string,
    data: { field_name?: string; type?: number; property?: unknown },
  ): Promise<void> {
    await this.client.bitable.appTableField.update({
      path: { app_token: appToken, table_id: tableId, field_id: fieldId },
      data: data as any,
    });
  }

  /**
   * 删除字段
   */
  async deleteField(appToken: string, tableId: string, fieldId: string): Promise<void> {
    await this.client.bitable.appTableField.delete({
      path: { app_token: appToken, table_id: tableId, field_id: fieldId },
    });
  }

  /**
   * 批量创建字段
   */
  async batchCreateFields(
    appToken: string,
    tableId: string,
    fields: Array<{ field_name: string; type: number; property?: unknown }>
  ): Promise<void> {
    for (const field of fields) {
      await this.client.bitable.appTableField.create({
        path: { app_token: appToken, table_id: tableId },
        data: field as any,
      });
    }
  }

  /**
   * 初始化表格结构：
   * 1. 将主键字段改为自动编号（序号）
   * 2. 删除飞书自动创建的默认非主键字段（单选/日期/附件等）
   * 3. 批量创建业务字段
   */
  async initializeTableSchema(
    appToken: string,
    tableId: string,
    fields: Array<{ field_name: string; type: number; property?: unknown }>,
  ): Promise<void> {
    const existing = await this.listFields(appToken, tableId);

    const primary = existing.find((f) => f.is_primary);
    const nonPrimary = existing.filter((f) => !f.is_primary);

    // 将主键字段改为自动编号
    if (primary) {
      await this.updateField(appToken, tableId, primary.field_id, {
        field_name: '序号',
        type: 1005,
      });
    }

    // 删除所有默认非主键字段
    for (const field of nonPrimary) {
      await this.deleteField(appToken, tableId, field.field_id);
    }

    // 批量创建业务字段
    await this.batchCreateFields(appToken, tableId, fields);
  }

  /**
   * 清空表中全部记录（用于新建多维表格后去掉默认/示例行）。
   * 单次 batchDelete 最多 500 条，会分页拉取并分批删除。
   */
  async clearAllRecords(appToken: string, tableId: string): Promise<void> {
    const BATCH_SIZE = 500;
    let recordIds: string[] = [];
    const iterator = await this.client.bitable.appTableRecord.listWithIterator({
      path: { app_token: appToken, table_id: tableId },
      params: { page_size: BATCH_SIZE } as any,
    });
    for await (const page of iterator) {
      if (page?.items?.length) {
        recordIds = recordIds.concat(page.items.map((r: any) => r.record_id));
      }
    }
    if (recordIds.length === 0) return;
    for (let i = 0; i < recordIds.length; i += BATCH_SIZE) {
      const chunk = recordIds.slice(i, i + BATCH_SIZE);
      await this.client.bitable.appTableRecord.batchDelete({
        path: { app_token: appToken, table_id: tableId },
        data: { records: chunk },
      } as any);
    }
  }

  /**
   * 获取记录列表
   */
  async listRecords(filter?: string): Promise<any[]> {
    const records: any[] = [];
    const iterator = await this.client.bitable.appTableRecord.listWithIterator({
      path: { app_token: this.appToken, table_id: this.tableId },
      params: { filter, page_size: 100 } as any,
    });

    for await (const page of iterator) {
      if (page?.items) {
        records.push(...page.items);
      }
    }
    return records;
  }

  /**
   * 创建记录
   */
  async createRecord(fields: Record<string, unknown>): Promise<string> {
    const res = await this.client.bitable.appTableRecord.create({
      path: { app_token: this.appToken, table_id: this.tableId },
      data: { fields } as any,
    });
    return (res as any).data?.record?.record_id ?? '';
  }

  /**
   * 更新记录
   */
  async updateRecord(recordId: string, fields: Record<string, unknown>): Promise<void> {
    await this.client.bitable.appTableRecord.update({
      path: { app_token: this.appToken, table_id: this.tableId, record_id: recordId },
      data: { fields } as any,
    });
  }
}
