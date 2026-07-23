/**
 * インポート先(整形後)ターゲットスキーマ。
 * 内蔵プリセットと、ユーザーがアップロードしたヘッダーからの動的生成の両方を扱う。
 */
import type { SourceDataset, TargetField, TargetSchema } from '../types';

/** Salesforce Lead オブジェクトの代表的な項目 */
const SALESFORCE_LEAD: TargetSchema = {
  id: 'salesforce-lead',
  name: 'Salesforce — リード(Lead)',
  origin: 'preset',
  fields: [
    {
      key: 'LastName',
      label: '姓',
      required: true,
      type: 'string',
      aliases: ['姓', '苗字', '名字', 'lastname', 'last name', 'family name'],
    },
    {
      key: 'FirstName',
      label: '名',
      required: false,
      type: 'string',
      aliases: ['名', 'firstname', 'first name', 'given name'],
    },
    {
      key: 'Company',
      label: '会社名',
      required: true,
      type: 'string',
      aliases: ['会社名', '会社', '企業名', '法人名', '団体名', 'company', 'account', 'organization', '組織名'],
    },
    {
      key: 'Title',
      label: '役職',
      required: false,
      type: 'string',
      aliases: ['役職', '肩書', '職位', 'title', 'position', 'job title'],
    },
    {
      key: 'Email',
      label: 'メール',
      required: false,
      type: 'email',
      aliases: ['メール', 'メールアドレス', 'email', 'e-mail', 'mail'],
    },
    {
      key: 'Phone',
      label: '電話番号',
      required: false,
      type: 'phone',
      aliases: ['電話', '電話番号', 'tel', 'phone', 'telephone', '連絡先'],
    },
    {
      key: 'MobilePhone',
      label: '携帯電話',
      required: false,
      type: 'phone',
      aliases: ['携帯', '携帯電話', 'mobile', 'cell', 'ケータイ'],
    },
    {
      key: 'Street',
      label: '町名・番地',
      required: false,
      type: 'string',
      aliases: ['住所', '町名', '番地', 'street', 'address'],
    },
    {
      key: 'State',
      label: '都道府県',
      required: false,
      type: 'string',
      aliases: ['都道府県', '県', 'state', 'prefecture'],
    },
    {
      key: 'PostalCode',
      label: '郵便番号',
      required: false,
      type: 'string',
      aliases: ['郵便番号', '〒', 'zip', 'postal', 'postalcode', 'post code'],
    },
    {
      key: 'Website',
      label: 'Webサイト',
      required: false,
      type: 'url',
      aliases: ['url', 'website', 'web', 'ホームページ', 'サイト', 'hp'],
    },
    {
      key: 'LeadSource',
      label: 'リードソース',
      required: false,
      type: 'string',
      aliases: ['リードソース', '流入元', '獲得経路', 'source', 'leadsource', '経路'],
    },
    {
      key: 'Industry',
      label: '業種',
      required: false,
      type: 'string',
      aliases: ['業種', '業界', 'industry'],
    },
  ],
};

/** HubSpot コンタクトの代表的な項目 */
const HUBSPOT_CONTACT: TargetSchema = {
  id: 'hubspot-contact',
  name: 'HubSpot — コンタクト(Contact)',
  origin: 'preset',
  fields: [
    {
      key: 'firstname',
      label: '名(First name)',
      required: false,
      type: 'string',
      aliases: ['名', 'firstname', 'first name', 'given name'],
    },
    {
      key: 'lastname',
      label: '姓(Last name)',
      required: true,
      type: 'string',
      aliases: ['姓', '苗字', '名字', 'lastname', 'last name'],
    },
    {
      key: 'email',
      label: 'Email',
      required: true,
      type: 'email',
      aliases: ['メール', 'メールアドレス', 'email', 'e-mail', 'mail'],
    },
    {
      key: 'company',
      label: 'Company name',
      required: false,
      type: 'string',
      aliases: ['会社名', '会社', '企業名', '法人名', 'company', 'organization'],
    },
    {
      key: 'jobtitle',
      label: 'Job title',
      required: false,
      type: 'string',
      aliases: ['役職', '肩書', 'title', 'jobtitle', 'position'],
    },
    {
      key: 'phone',
      label: 'Phone number',
      required: false,
      type: 'phone',
      aliases: ['電話', '電話番号', 'tel', 'phone', '連絡先'],
    },
    {
      key: 'website',
      label: 'Website URL',
      required: false,
      type: 'url',
      aliases: ['url', 'website', 'web', 'ホームページ', 'サイト'],
    },
    {
      key: 'hs_lead_status',
      label: 'Lead status',
      required: false,
      type: 'string',
      aliases: ['ステータス', 'status', 'lead status', '状態'],
    },
  ],
};

/**
 * Microsoft Dynamics 365 Sales のリード(Lead)。
 * キーは Dataverse の論理名(データインポート時の列名に使われる)。
 */
const DYNAMICS_LEAD: TargetSchema = {
  id: 'dynamics-lead',
  name: 'Microsoft Dynamics 365 — リード(Lead)',
  origin: 'preset',
  fields: [
    {
      key: 'subject',
      label: 'トピック',
      required: true,
      type: 'string',
      aliases: ['トピック', '件名', '要件', 'topic', 'subject', 'タイトル'],
    },
    {
      key: 'lastname',
      label: '姓',
      required: true,
      type: 'string',
      aliases: ['姓', '苗字', '名字', 'lastname', 'last name'],
    },
    {
      key: 'firstname',
      label: '名',
      required: false,
      type: 'string',
      aliases: ['名', 'firstname', 'first name'],
    },
    {
      key: 'companyname',
      label: '会社名',
      required: false,
      type: 'string',
      aliases: ['会社名', '会社', '企業名', '法人名', '団体名', '組織名', 'company', 'companyname', 'account'],
    },
    {
      key: 'jobtitle',
      label: '役職',
      required: false,
      type: 'string',
      aliases: ['役職', '肩書', '職位', 'title', 'jobtitle', 'position'],
    },
    {
      key: 'emailaddress1',
      label: 'メール',
      required: false,
      type: 'email',
      aliases: ['メール', 'メールアドレス', 'email', 'e-mail', 'mail', 'emailaddress'],
    },
    {
      key: 'telephone1',
      label: '勤務先電話',
      required: false,
      type: 'phone',
      aliases: ['電話', '電話番号', 'tel', 'phone', '連絡先', 'business phone', 'telephone'],
    },
    {
      key: 'mobilephone',
      label: '携帯電話',
      required: false,
      type: 'phone',
      aliases: ['携帯', '携帯電話', 'mobile', 'cell', 'ケータイ'],
    },
    {
      key: 'address1_line1',
      label: '住所(番地)',
      required: false,
      type: 'string',
      aliases: ['住所', '町名', '番地', 'street', 'address', 'address1'],
    },
    {
      key: 'address1_city',
      label: '市区町村',
      required: false,
      type: 'string',
      aliases: ['市区町村', '市', '区', 'city'],
    },
    {
      key: 'address1_stateorprovince',
      label: '都道府県',
      required: false,
      type: 'string',
      aliases: ['都道府県', '県', 'state', 'prefecture', 'province'],
    },
    {
      key: 'address1_postalcode',
      label: '郵便番号',
      required: false,
      type: 'string',
      aliases: ['郵便番号', '〒', 'zip', 'postal', 'postalcode', 'post code'],
    },
    {
      key: 'websiteurl',
      label: 'Webサイト',
      required: false,
      type: 'url',
      aliases: ['url', 'website', 'web', 'ホームページ', 'サイト', 'hp'],
    },
    {
      key: 'leadsourcecode',
      label: 'リードソース',
      required: false,
      type: 'string',
      aliases: ['リードソース', '流入元', '獲得経路', 'source', 'leadsource', '経路'],
    },
    {
      key: 'industrycode',
      label: '業種',
      required: false,
      type: 'string',
      aliases: ['業種', '業界', 'industry'],
    },
    {
      key: 'description',
      label: '説明(備考)',
      required: false,
      type: 'string',
      aliases: ['備考', 'メモ', '説明', 'コメント', 'notes', 'description', 'remarks', '摘要'],
    },
  ],
};

export const PRESET_SCHEMAS: TargetSchema[] = [
  SALESFORCE_LEAD,
  HUBSPOT_CONTACT,
  DYNAMICS_LEAD,
];

export function getPresetById(id: string): TargetSchema | undefined {
  return PRESET_SCHEMAS.find((s) => s.id === id);
}

/**
 * ユーザーがアップロードした「インポート用シート」のヘッダー行から
 * ターゲットスキーマを生成する。各列名をそのままキー兼ラベルにする。
 */
export function schemaFromUploadedHeader(
  dataset: SourceDataset,
): TargetSchema {
  const fields: TargetField[] = dataset.columns.map((c) => ({
    key: c.name,
    label: c.name,
    required: false,
    type: c.inferredType === 'empty' ? 'string' : c.inferredType,
    aliases: [c.name],
  }));
  return {
    id: `uploaded-${Date.now()}`,
    name: `アップロード: ${dataset.fileName}`,
    origin: 'uploaded',
    fields,
  };
}
