import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp, getDocs } from 'firebase/firestore';
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
    const [attendanceDocs, setAttendanceDocs] = useState<any[]>([]);
    const [stats, setStats] = useState({
        todayCount: 0,
        pendingCount: 0,
        approvedToday: 0,
        segmentation: { ...emptySeg },
    });
    const [membersMap, setMembersMap] = useState<Record<string, any>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [showSegDialog, setShowSegDialog] = useState(false);



    useEffect(() => {
        if (!user) return;

        // Query attendance for "Today" (from midnight)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = Timestamp.fromDate(today);

        setIsLoading(true);

        const unsubscribes: Array<() => void> = [];
        let strDocs: any[] = [];
        let numDocs: any[] = [];

        const mergeAndSet = () => {
            const mergedMap = new Map<string, any>();
            [...strDocs, ...numDocs].forEach((row) => mergedMap.set(row.id, row));
            setAttendanceDocs(Array.from(mergedMap.values()));
            setIsLoading(false);
        };

        const makeListener = (q: any, assign: (rows: any[]) => void) =>
            onSnapshot(
                q,
                (snapshot: any) => {
                    if (snapshot.docs) {
                        assign(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() })));
                        mergeAndSet();
                    }
                },
                (err: any) => {
                    console.error('Attendance query failed', err);
                    assign([]);
                    mergeAndSet();
                }
            );

        if (user.role === 'SUPER_ADMIN') {
            const qAll = query(
                collection(db, 'attendance'),
                where('attendance_date_time', '>=', todayTimestamp)
            );
            unsubscribes.push(makeListener(qAll, (rows) => (strDocs = rows)));
        } else {
            // Strictly query using the user's branch_id type (matches Firestore rules)
            const branchValue = user.branch_id;

            // Query 1: origin_branch_id matches user's branch_id
            const qOrigin = query(
                collection(db, 'attendance'),
                where('attendance_date_time', '>=', todayTimestamp),
                where('origin_branch_id', '==', branchValue)
            );
            unsubscribes.push(makeListener(qOrigin, (rows) => {
                strDocs = rows;
                mergeAndSet();
            }));

            // Query 2: visited_branch_id matches user's branch_id
            const qVisited = query(
                collection(db, 'attendance'),
                where('attendance_date_time', '>=', todayTimestamp),
                where('visited_branch_id', '==', branchValue)
            );
            unsubscribes.push(makeListener(qVisited, (rows) => {
                numDocs = rows; // keeping variable name for now to minimize diff, acts as visitedDocs
                mergeAndSet();
            }));
        }

        return () => unsubscribes.forEach((u) => u());
    }, [user]);

    // Load members map
    useEffect(() => {
        const fetchMembers = async () => {
            if (!user) return;

            const membersRef = collection(db, 'members');
            let q: any = membersRef;

            if (user.role !== 'SUPER_ADMIN') {
                // Correct field name is 'origin_branch_id'
                q = query(membersRef, where('origin_branch_id', '==', user.branch_id));
            }

            try {
                const querySnapshot = await getDocs(q);
                const members: Record<string, any> = {};
                querySnapshot.forEach((doc: any) => {
                    members[doc.id] = { id: doc.id, ...(doc.data() as any) };
                });
                setMembersMap(members);
            } catch (error) {
                console.error('Error fetching members:', error);
                // Fail silently for dashboard stats if members can't be loaded, preventing red box
            }
        };

        fetchMembers();
    }, [user]);

    // Derive stats whenever attendance docs or members map change
    useEffect(() => {
        try {
            let todayCount = 0;
            let pendingCount = 0;
            let approvedToday = 0;
            const segCounts: Record<SegKey, number> = { ...emptySeg };

            attendanceDocs.forEach((row: any) => {
                todayCount++;
                if (row.status === 'PENDING') pendingCount++;
                if (row.status === 'APPROVED') approvedToday++;

                const memberId = row.member_id || row.member?.id;
                const segRaw = (memberId && membersMap[memberId]?.segmentation) || row.member?.segmentation;
                const normalized = typeof segRaw === 'string'
                    ? segRaw.trim().toLowerCase()
                    : '';
                let label: SegKey = 'Not Segmented';
                if (normalized === 'bronze') label = 'Bronze';
                else if (normalized === 'silver') label = 'Silver';
                else if (normalized === 'gold') label = 'Gold';
                else if (normalized === 'diamond') label = 'Diamond';
                segCounts[label] = (segCounts[label] || 0) + 1;
            });

            setStats({
                todayCount,
                pendingCount,
                approvedToday,
                segmentation: segCounts,
            });
        } catch (e) {
            console.error("Stats calculation error:", e);
        }
    }, [attendanceDocs, membersMap]);

    return (
        <>
            <div className="min-h-screen bg-muted/30">
                <header className="border-b bg-background sticky top-0 z-10">
                    <div className="container mx-auto flex h-14 md:h-16 items-center justify-between px-4">
                        <div className="font-bold text-lg md:text-xl text-primary">Barbaza MPC Attendance System</div>
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
                                <div className="flex items-center gap-2">
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
                            <Button size="lg" className="h-20 md:h-24 w-full flex-col gap-2 bg-[#2c2a9c] hover:bg-[#241f7a] text-white">
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
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Today's Attendance by Segmentation</DialogTitle>
                        <DialogDescription>Counts are based on attendance logged since midnight today.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
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
