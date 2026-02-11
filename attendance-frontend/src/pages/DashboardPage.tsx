import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { LogOut, UserPlus, ClipboardList, CheckCircle, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type SegKey = 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Not Segmented';

const emptySeg: Record<SegKey, number> = {
    Bronze: 0,
    Silver: 0,
    Gold: 0,
    Diamond: 0,
    'Not Segmented': 0,
};

const DashboardPage = () => {
    const { user, logout } = useAuth();
    const [stats, setStats] = useState({
        todayCount: 0,
        pendingCount: 0,
        approvedToday: 0,
        segmentation: { ...emptySeg },
    });
    const [isLoading, setIsLoading] = useState(true);
    const [showSegDialog, setShowSegDialog] = useState(false);

    useEffect(() => {
        const fetchStats = async (showLoading = false) => {
            if (!user) return;
            if (showLoading) setIsLoading(true);
            try {
                const response = await api.get('dashboard/stats');
                const data = response.data;
                setStats({
                    todayCount: data.present_today + data.pending_approvals, // Total logged today
                    pendingCount: data.pending_approvals,
                    approvedToday: data.present_today,
                    segmentation: data.segmentation,
                });
            } catch (error) {
                console.error('Error fetching dashboard stats:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats(true);

        // Polling for updates since we lost real-time Firebase
        const interval = setInterval(() => fetchStats(false), 30000); // 30 seconds
        return () => clearInterval(interval);
    }, [user]);

    return (
        <>
            <div className="min-h-screen bg-muted/30">
                <header className="border-b bg-background sticky top-0 z-10">
                    <div className="container mx-auto flex h-14 md:h-16 items-center justify-between px-4">
                        <div className="min-w-0 flex-1 pr-2 font-bold text-base md:text-xl text-primary truncate">
                            Barbaza MPC Attendance System
                        </div>
                        <div className="flex items-center gap-2 md:gap-4">
                            <div className="text-xs md:text-sm text-muted-foreground hidden sm:block">
                                {user?.name} ({user?.role})
                            </div>
                            <Button variant="ghost" size="sm" onClick={logout} className="h-9">
                                <LogOut className="h-4 w-4 md:mr-2" />
                                <span className="hidden md:inline">Logout</span>
                            </Button>
                        </div>
                    </div>
                </header>

                <main className="container mx-auto p-3 md:p-4 space-y-4 md:space-y-6">
                    <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Today's Attendance</CardTitle>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-3 text-xs"
                                        onClick={() => setShowSegDialog(true)}
                                    >
                                        View Summary
                                    </Button>
                                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl md:text-3xl font-bold">{isLoading ? '...' : stats?.todayCount}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
                                <ClipboardList className="h-4 w-4 text-orange-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl md:text-3xl font-bold">{isLoading ? '...' : stats?.pendingCount}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Approved Today</CardTitle>
                                <CheckCircle className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl md:text-3xl font-bold">{isLoading ? '...' : stats?.approvedToday}</div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                        <Link to="/present" className="w-full">
                            <Button size="lg" className="h-20 md:h-24 w-full flex-col gap-2 bg-[#2c2a9c] hover:bg-[#241f7a] text-white">
                                <UserPlus className="h-5 w-5 md:h-6 md:w-6" />
                                <span className="text-sm md:text-base">Log Attendance</span>
                            </Button>
                        </Link>
                        {user?.role !== 'STAFF' && (
                            <Link to="/pending" className="w-full">
                                <Button size="lg" variant="outline" className="h-20 md:h-24 w-full flex-col gap-2">
                                    <ClipboardList className="h-5 w-5 md:h-6 md:w-6" />
                                    <span className="text-sm md:text-base">Review Pendings</span>
                                </Button>
                            </Link>
                        )}
                        <Link to="/records" className="w-full">
                            <Button size="lg" variant="outline" className="h-20 md:h-24 w-full flex-col gap-2">
                                <CheckCircle className="h-5 w-5 md:h-6 md:w-6" />
                                <span className="text-sm md:text-base">Attendance History</span>
                            </Button>
                        </Link>
                        <Link to="/members" className="w-full">
                            <Button size="lg" variant="outline" className="h-20 md:h-24 w-full flex-col gap-2">
                                <UserPlus className="h-5 w-5 md:h-6 md:w-6 text-blue-500" />
                                <span className="text-sm md:text-base">Manage Members</span>
                            </Button>
                        </Link>
                        {user?.role === 'SUPER_ADMIN' && (
                            <Link to="/audit-logs" className="w-full">
                                <Button size="lg" variant="outline" className="h-20 md:h-24 w-full flex-col gap-2">
                                    <FileText className="h-5 w-5 md:h-6 md:w-6 text-orange-500" />
                                    <span className="text-sm md:text-base">Audit Logs</span>
                                </Button>
                            </Link>
                        )}
                        {user?.role === 'SUPER_ADMIN' && (
                            <Link to="/users" className="w-full">
                                <Button size="lg" variant="outline" className="h-20 md:h-24 w-full flex-col gap-2">
                                    <UserPlus className="h-5 w-5 md:h-6 md:w-6 text-purple-500" />
                                    <span className="text-sm md:text-base">Manage Users</span>
                                </Button>
                            </Link>
                        )}
                    </div>

                </main>
            </div>

            {/* Segmentation Summary Dialog */}
            <Dialog open={showSegDialog} onOpenChange={setShowSegDialog}>
                <DialogContent className="max-w-[95vw] sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Today's Attendance by Segmentation</DialogTitle>
                        <DialogDescription>Counts are based on attendance logged since midnight today.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {[
                            { label: 'Bronze', color: 'text-[#8c6239] bg-[#f6e9dd]' },
                            { label: 'Silver', color: 'text-[#6c6c6c] bg-[#efefef]' },
                            { label: 'Gold', color: 'text-[#c99700] bg-[#fff6d6]' },
                            { label: 'Diamond', color: 'text-[#1f4b99] bg-[#e6ecfb]' },
                            { label: 'Not Segmented', color: 'text-[#475569] bg-[#f1f5f9]' },
                        ].map((seg) => (
                            <div
                                key={seg.label}
                                className={`rounded-lg border border-muted bg-white p-3 flex flex-col items-center gap-1 shadow-sm`}
                            >
                                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${seg.color}`}>
                                    {seg.label}
                                </span>
                                <span className="text-xl font-bold">
                                    {stats.segmentation[seg.label as keyof typeof stats.segmentation] ?? 0}
                                </span>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default DashboardPage;
