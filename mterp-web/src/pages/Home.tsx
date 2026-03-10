import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench,
  ClipboardList,
  Clock,
  Truck,
  CheckSquare,
  ChevronRight,
  HardHat,
  FileText,
  DollarSign,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Badge } from '../components/shared';

interface DashboardCardProps {
  icon: React.ElementType;
  label: string;
  sub: string;
  color: string;
  bg: string;
  onClick: () => void;
}

interface UpdateItem {
  _id: string;
  type: 'project' | 'attendance' | 'report';
  icon: string;
  title: string;
  description: string;
  subtitle: string;
  timestamp: string;
  color: string;
  bg: string;
}

const DashboardCard: React.FC<DashboardCardProps> = ({
  icon: Icon,
  label,
  sub,
  color,
  bg,
  onClick,
}) => (
  <Card className="flex flex-col items-center text-center p-4 cursor-pointer" onClick={onClick}>
    <div className="w-12 h-12 rounded-md flex items-center justify-center mb-3" style={{ backgroundColor: bg }}>
      <Icon size={24} color={color} />
    </div>
    <div className="flex flex-col">
      <span className="text-base font-bold text-text-primary">{label}</span>
      <span className="text-xs text-text-muted font-medium">{sub}</span>
    </div>
  </Card>
);

const getIcon = (iconName: string) => {
  const icons: Record<string, React.ElementType> = {
    HardHat,
    Clock,
    FileText,
    Wrench,
    Truck,
  };
  return icons[iconName] || FileText;
};

export default function Home() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);

  useEffect(() => {
    fetchUpdates();
  }, []);

  const fetchUpdates = async () => {
    try {
      const response = await api.get('/updates');
      setUpdates(response.data);
    } catch (err) {
      console.error('Failed to fetch updates', err);
    } finally {
      setLoadingUpdates(false);
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `${diffMins}${t('home.time.minsAgo')}`;
    if (diffHours < 24) return `${diffHours}${t('home.time.hoursAgo')}`;
    if (diffDays < 7) return `${diffDays}${t('home.time.daysAgo')}`;
    return date.toLocaleDateString(i18n.language === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.greeting.morning');
    if (hour < 17) return t('home.greeting.afternoon');
    return t('home.greeting.evening');
  };

  return (
    <div className="p-6 max-w-[900px] max-lg:p-4 max-sm:p-3">
      {/* Header Section */}
      <div className="bg-gradient-to-br from-primary to-primary-light p-8 rounded-2xl mb-6 relative overflow-hidden max-sm:p-5 max-sm:rounded-xl">
        <div className="relative z-10">
          <div>
            <span className="text-white/80 text-base font-medium">{getGreeting()},</span>
            <h1 className="text-white text-2xl font-bold mt-1 mb-2 max-sm:text-lg">{user?.fullName || 'User'}</h1>
            <Badge
              label={user?.role?.toUpperCase() || 'STAFF'}
              variant="neutral"
              size="small"
              className="bg-white/20 border-white/30 text-white"
            />
          </div>
        </div>
        <div className="absolute -top-[50px] -right-[50px] w-[200px] h-[200px] rounded-full bg-white/5"></div>
        <div className="absolute -bottom-[20px] left-[20px] w-[100px] h-[100px] rounded-full bg-[#818CF8]/20 blur-[20px]"></div>
      </div>

      {/* Main Grid */}
      <div className="flex flex-col gap-4">
        {/* Big Cards */}
        <Card className="flex justify-between items-center p-5 cursor-pointer max-sm:p-4" onClick={() => navigate('/projects')}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg flex items-center justify-center max-sm:w-11 max-sm:h-11 gradient-gold">
              <HardHat size={32} color="white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary m-0">{t('home.cards.projectsTitle')}</h3>
              <p className="text-sm text-text-secondary mt-0.5 mb-0 mx-0">{t('home.cards.projectsSub')}</p>
            </div>
          </div>
          <div className="w-9 h-9 rounded-full bg-bg-secondary flex items-center justify-center">
            <ChevronRight size={20} color="var(--primary)" />
          </div>
        </Card>

        <Card className="flex justify-between items-center p-5 cursor-pointer max-sm:p-4" onClick={() => navigate('/tools')}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg flex items-center justify-center max-sm:w-11 max-sm:h-11 gradient-primary">
              <Wrench size={32} color="white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary m-0">{t('home.cards.toolsTitle')}</h3>
              <p className="text-sm text-text-secondary mt-0.5 mb-0 mx-0">{t('home.cards.toolsSub')}</p>
            </div>
          </div>
          <div className="w-9 h-9 rounded-full bg-bg-secondary flex items-center justify-center">
            <ChevronRight size={20} color="var(--primary)" />
          </div>
        </Card>

        {/* Small Cards Row - Role Based */}
        <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          <DashboardCard
            icon={Clock}
            label={t('home.cards.attendanceTitle')}
            sub={t('home.cards.attendanceSub')}
            color="#10B981"
            bg="#D1FAE5"
            onClick={() => navigate('/attendance')}
          />
          <DashboardCard
            icon={ClipboardList}
            label={t('home.cards.tasksTitle')}
            sub={t('home.cards.tasksSub')}
            color="#F59E0B"
            bg="#FEF3C7"
            onClick={() => navigate('/tasks')}
          />
        </div>

        {/* My Payments - for worker roles */}
        {user?.role && ['worker', 'tukang', 'mandor'].includes(user.role) && (
          <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            <DashboardCard
              icon={DollarSign}
              label={t('home.cards.paymentsTitle')}
              sub={t('home.cards.paymentsSub')}
              color="#059669"
              bg="#D1FAE5"
              onClick={() => navigate('/my-payments')}
            />
          </div>
        )}

        {/* Materials - for supervisor, asset_admin, director, owner */}
        {user?.role && ['supervisor', 'asset_admin', 'director', 'owner'].includes(user.role) && (
          <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            <DashboardCard
              icon={Truck}
              label={t('home.cards.materialsTitle')}
              sub={t('home.cards.materialsSub')}
              color="#8B5CF6"
              bg="#EDE9FE"
              onClick={() => navigate('/materials')}
            />
            {/* Approvals - for director, owner only */}
            {['director', 'owner'].includes(user.role) ? (
              <DashboardCard
                icon={CheckSquare}
                label={t('home.cards.approvalsTitle')}
                sub={t('home.cards.approvalsSub')}
                color="#3B82F6"
                bg="#DBEAFE"
                onClick={() => navigate('/approvals')}
              />
            ) : (
              <DashboardCard
                icon={ClipboardList}
                label={t('home.cards.reportTitle')}
                sub={t('home.cards.reportSub')}
                color="#3B82F6"
                bg="#DBEAFE"
                onClick={() => navigate('/daily-report')}
              />
            )}
          </div>
        )}
      </div>

      {/* Site Updates Section */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-3 max-sm:flex-col max-sm:items-start max-sm:gap-1">
          <span className="text-sm font-bold text-text-muted tracking-[1px]">{t('home.updates.title')}</span>
          {updates.length > 3 && (
            <button className="text-sm font-bold text-primary cursor-pointer" onClick={() => navigate('/updates')}>{t('home.updates.viewAll')}</button>
          )}
        </div>
        
        {loadingUpdates ? (
          <div className="bg-bg-white rounded-xl p-6 text-center text-text-muted">{t('home.updates.loading')}</div>
        ) : updates.length === 0 ? (
          <div className="bg-bg-white rounded-xl p-8 text-center text-text-muted">
            <p>{t('home.updates.empty')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {updates.slice(0, 5).map((update) => {
              const IconComponent = getIcon(update.icon);
              return (
                <div key={update._id} className="flex gap-3 p-4 bg-bg-white rounded-lg shadow-sm">
                  <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: update.bg }}>
                    <IconComponent size={18} color={update.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1 max-sm:flex-col max-sm:items-start max-sm:gap-1">
                      <span className="text-xs font-bold text-text-muted uppercase tracking-[0.5px]">{update.title}</span>
                      <span className="text-xs text-text-muted">{formatTimeAgo(update.timestamp)}</span>
                    </div>
                    <p className="text-sm font-semibold text-text-primary m-0 truncate">{update.description}</p>
                    <p className="text-xs text-text-secondary mt-1 mb-0 mx-0">{update.subtitle}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
