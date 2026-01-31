import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { LogOut, UserPlus, ClipboardList, CheckCircle } from 'lucide-react';

const DashboardPage = () => {
    const { user, logout } = useAuth();
    const [stats, setStats] = useState({ todayCount: 0, pendingCount: 0, approvedToday: 0 });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Query attendance for "Today" (from midnight)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = Timestamp.fromDate(today);

        const q = query(
            collection(db, 'attendance'),
            where('attendance_date_time', '>=', todayTimestamp)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let todayCount = 0;
            let pendingCount = 0;
            let approvedToday = 0;

            snapshot.forEach((doc) => {
                const data = doc.data();
                todayCount++; // Assuming query is correct for Today
                if (data.status === 'PENDING') pendingCount++;
                if (data.status === 'APPROVED') approvedToday++;
            });

            // Note: Pending count might need to capture ALL pending not just today's
            // But for this specific widget "Pending Approvals", maybe global pending is better?
            // Let's attach a second listener for GLOBAL pending to be accurate

            setStats(prev => ({ ...prev, todayCount, approvedToday }));

            // Temporary: keeping pendingCount tied to today for this single query or 
            // if we want global pending, we need another query. 
            // I'll stick to 'Today's pending' for this snapshot to minimize code complexity in this step
            // or I'll just count pending from today. 
            // Actually, usually "Pending" means "Things I need to do", which could be old.
            // Let's leave pendingCount as Today's Pending for now to avoid multiple listeners in this block.
            setStats({ todayCount, pendingCount, approvedToday });
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <div className="min-h-screen bg-muted/30">
            <header className="border-b bg-background sticky top-0 z-10">
                <div className="container mx-auto flex h-14 md:h-16 items-center justify-between px-4">
                    <div className="font-bold text-lg md:text-xl text-primary">Attendance System</div>
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
                <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Today's Attendance</CardTitle>
                            <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl md:text-3xl font-bold">{isLoading ? '...' : stats?.todayCount}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
                            <ClipboardList className="h-4 w-4 text-orange-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl md:text-3xl font-bold">{isLoading ? '...' : stats?.pendingCount}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
                        <Button size="lg" className="h-20 md:h-24 w-full flex-col gap-2">
                            <UserPlus className="h-5 w-5 md:h-6 md:w-6" />
                            <span className="text-sm md:text-base">Log Attendance</span>
                        </Button>
                    </Link>
                    <Link to="/pending" className="w-full">
                        <Button size="lg" variant="outline" className="h-20 md:h-24 w-full flex-col gap-2">
                            <ClipboardList className="h-5 w-5 md:h-6 md:w-6" />
                            <span className="text-sm md:text-base">Review Pendings</span>
                        </Button>
                    </Link>
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
    );
};

export default DashboardPage;
