import { useState, useEffect } from 'react';
import { ConfigProvider, Layout, Card, Upload, Table, DatePicker, Input, Statistic, Image, Modal, message, Space, Button } from 'antd';
import type { UploadProps } from 'antd';
import { UploadOutlined, SearchOutlined, BarChartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  uploadInvoice,
  listInvoices,
  getStats,
  getImageUrl,
  type Invoice,
} from './api';
import './App.css';

const { RangePicker } = DatePicker;
const { Header, Content } = Layout;

function App() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ count: 0, totalAmount: 0 });
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [keyword, setKeyword] = useState('');
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchList = async () => {
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
    } catch (e) {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const uploadProps: UploadProps = {
    name: 'file',
    accept: 'image/*',
    showUploadList: false,
    beforeUpload: async (file) => {
      setUploading(true);
      try {
        await uploadInvoice(file);
        message.success('上传成功，已识别并存储');
        fetchList();
      } catch (e) {
        message.error(e instanceof Error ? e.message : '上传失败');
      } finally {
        setUploading(false);
      }
      return false;
    },
  };

  const columns = [
    { title: '发票代码', dataIndex: 'invoice_code', key: 'invoice_code', width: 120 },
    { title: '发票号码', dataIndex: 'invoice_number', key: 'invoice_number', width: 120 },
    { title: '开票日期', dataIndex: 'invoice_date', key: 'invoice_date', width: 110 },
    { title: '销方名称', dataIndex: 'seller_name', key: 'seller_name', ellipsis: true },
    { title: '购方名称', dataIndex: 'buyer_name', key: 'buyer_name', ellipsis: true },
    {
      title: '价税合计',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 100,
      render: (v: number) => `¥${Number(v).toFixed(2)}`,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: Invoice) => (
        <a onClick={() => setPreviewInvoice(record)}>查看图片</a>
      ),
    },
  ];

  return (
    <ConfigProvider
      theme={{
        token: { colorPrimary: '#1890ff', borderRadius: 6 },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ display: 'flex', alignItems: 'center', background: '#001529', padding: '0 24px' }}>
          <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>发票管理系统</div>
        </Header>
        <Content style={{ padding: 24, background: '#f0f2f5' }}>
          <Card style={{ marginBottom: 16 }}>
            <Space wrap size="middle">
              <Upload {...uploadProps}>
                <Button icon={<UploadOutlined />} loading={uploading}>
                  上传发票图片
                </Button>
              </Upload>
              <RangePicker
                value={dateRange}
                onChange={(v) => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
              />
              <Input
                placeholder="模糊搜索（发票号/销方/购方/商品）"
                prefix={<SearchOutlined />}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{ width: 260 }}
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
    </ConfigProvider>
  );
}

export default App;
