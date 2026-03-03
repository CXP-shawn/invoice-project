import { useState, useEffect, useCallback, useRef } from 'react';
import { ConfigProvider, Layout, Card, Upload, Table, DatePicker, Input, Statistic, Image, Modal, Popconfirm, Form, App as AntApp, Space, Button } from 'antd';
import type { UploadProps } from 'antd';
import { UploadOutlined, SearchOutlined, BarChartOutlined, DeleteOutlined, EyeOutlined, EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  uploadInvoice,
  listInvoices,
  getStats,
  getImageUrl,
  deleteInvoice,
  updateInvoice,
  type Invoice,
} from './api';
import './App.css';

const { RangePicker } = DatePicker;
const { Header, Content } = Layout;

function InvoiceApp() {
  const { message } = AntApp.useApp();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ count: 0, totalAmount: 0 });
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [keyword, setKeyword] = useState('');
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const [list, stat] = await Promise.all([
        listInvoices({
          startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
          endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
          keyword: keyword || undefined,
        }),
        getStats({
          startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
          endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
          keyword: keyword || undefined,
        }),
      ]);
      setInvoices(list);
      setStats(stat);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; hint?: string } } };
      const hint = err?.response?.data?.hint;
      message.error(hint || err?.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [dateRange, keyword, message]);

  const isInitial = useRef(true);
  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      fetchList();
      return;
    }
    const t = setTimeout(() => fetchList(), 300);
    return () => clearTimeout(t);
  }, [dateRange, keyword, fetchList]);

  const uploadProps: UploadProps = {
    name: 'file',
    accept: 'image/*,.pdf',
    showUploadList: false,
    beforeUpload: async (file) => {
      setUploading(true);
      try {
        await uploadInvoice(file);
        message.success('上传成功，已识别并存储');
        fetchList();
      } catch (e: unknown) {
        const err = e as { response?: { data?: { error?: string; hint?: string } } };
        message.error(err?.response?.data?.hint || err?.response?.data?.error || (e instanceof Error ? e.message : '上传失败'));
      } finally {
        setUploading(false);
      }
      return false;
    },
  };

  const columns = [
    { title: '发票号码', dataIndex: 'invoice_number', key: 'invoice_number', width: 180, align: 'center' },
    {
      title: '开票日期',
      dataIndex: 'invoice_date',
      key: 'invoice_date',
      width: 110,
      align: 'center',
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD') : '-'),
    },
    { title: '销方名称', dataIndex: 'seller_name', key: 'seller_name', ellipsis: true, align: 'center' },
    { title: '购方名称', dataIndex: 'buyer_name', key: 'buyer_name', ellipsis: true, align: 'center' },
    {
      title: '价税合计',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 100,
      align: 'center',
      render: (v: number) => `¥${Number(v).toFixed(2)}`,
    },
    {
      title: '操作',
      key: 'action',
      width: 260,
      align: 'center',
      render: (_: unknown, record: Invoice) => (
        <div className="invoice-action-cell">
          <Space onClick={(e) => e.stopPropagation()} size="small">
          <Button
            type="primary"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setPreviewInvoice(record)}
            className="invoice-action-btn"
          >
            查看
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditInvoice(record);
              form.setFieldsValue({
                ...record,
                invoice_date: record.invoice_date ? dayjs(record.invoice_date) : null,
              });
            }}
            className="invoice-action-btn"
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除？"
            description="删除后该发票记录及图片将无法恢复"
            onConfirm={async () => {
              try {
                await deleteInvoice(record.id);
                message.success('已删除');
                fetchList();
              } catch (e: unknown) {
                const err = e as { response?: { data?: { error?: string } } };
                message.error(err?.response?.data?.error || '删除失败');
              }
            }}
            okText="删除"
            okButtonProps={{ danger: true, style: { borderRadius: 6 } }}
            cancelButtonProps={{ style: { borderRadius: 6 } }}
            cancelText="取消"
          >
            <Button
              type="primary"
              danger
              size="small"
              icon={<DeleteOutlined />}
              className="invoice-action-btn"
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
        </div>
      ),
    },
  ];

  return (
    <>
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ display: 'flex', alignItems: 'center', background: '#001529', padding: '0 24px' }}>
          <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>发票管理系统</div>
        </Header>
        <Content style={{ padding: 24, background: '#f0f2f5' }}>
          <Card style={{ marginBottom: 16 }}>
            <Space wrap size="middle">
              <Upload {...uploadProps}>
                <Button icon={<UploadOutlined />} loading={uploading}>
                  上传发票（图片/PDF）
                </Button>
              </Upload>
              <RangePicker
                value={dateRange}
                onChange={(v) => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
              />
              <Input
                placeholder="模糊搜索（发票号/销方/购方/商品，多词空格分隔）"
                prefix={<SearchOutlined />}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onPressEnter={() => fetchList()}
                style={{ width: 280 }}
                allowClear
              />
              <Button type="primary" onClick={fetchList} loading={loading}>
                查询
              </Button>
            </Space>
          </Card>

          <Card title={<><BarChartOutlined /> 统计</>} style={{ marginBottom: 16 }}>
            <Space size="large">
              <Statistic title="发票总张数" value={stats.count} />
              <Statistic title="总金额" value={stats.totalAmount} precision={2} prefix="¥" />
            </Space>
          </Card>

          <Card title="发票列表">
            <Table
              className="invoice-table"
              rowKey="id"
              columns={columns}
              dataSource={invoices}
              loading={loading}
              pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
              onRow={(record) => ({
                style: { cursor: 'pointer' },
                onClick: () => setPreviewInvoice(record),
              })}
            />
          </Card>
        </Content>
      </Layout>

      <Modal
        title="发票图片"
        open={!!previewInvoice}
        onCancel={() => setPreviewInvoice(null)}
        footer={null}
        width={700}
      >
        {previewInvoice && (
          <Image
            src={getImageUrl(previewInvoice.image_path)}
            alt="发票"
            style={{ width: '100%' }}
          />
        )}
      </Modal>

      <Modal
        title="编辑发票"
        open={!!editInvoice}
        onCancel={() => { setEditInvoice(null); form.resetFields(); }}
        onOk={async () => {
          try {
            const v = await form.validateFields();
            if (!editInvoice) return;
            await updateInvoice(editInvoice.id, {
              ...v,
              invoice_date: v.invoice_date?.format?.('YYYY-MM-DD') ?? v.invoice_date,
              total_amount: Number(v.total_amount) || 0,
            });
            message.success('已保存');
            setEditInvoice(null);
            form.resetFields();
            fetchList();
          } catch (e) {
            if (e?.errorFields) return;
            message.error('保存失败');
          }
        }}
        okText="保存"
        cancelText="取消"
        width={560}
        destroyOnClose
      >
        {editInvoice && (
          <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item name="invoice_number" label="发票号码">
              <Input placeholder="发票号码" />
            </Form.Item>
            <Form.Item name="invoice_date" label="开票日期">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="seller_name" label="销方名称">
              <Input placeholder="销售方/销方名称" />
            </Form.Item>
            <Form.Item name="seller_tax_id" label="销方税号">
              <Input placeholder="统一社会信用代码" />
            </Form.Item>
            <Form.Item name="buyer_name" label="购方名称">
              <Input placeholder="购买方/购方名称" />
            </Form.Item>
            <Form.Item name="buyer_tax_id" label="购方税号">
              <Input placeholder="统一社会信用代码" />
            </Form.Item>
            <Form.Item name="total_amount" label="价税合计">
              <Input type="number" step="0.01" placeholder="金额" addonBefore="¥" />
            </Form.Item>
            <Form.Item name="goods_name" label="商品/服务名称">
              <Input.TextArea rows={2} placeholder="货物或应税劳务名称" />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </>
  );
}

export default function App() {
  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1890ff', borderRadius: 6 } }}>
      <AntApp message={{ maxCount: 3 }}>
        <InvoiceApp />
      </AntApp>
    </ConfigProvider>
  );
}
