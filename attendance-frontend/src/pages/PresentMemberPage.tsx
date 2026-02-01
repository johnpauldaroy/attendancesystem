import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, addDoc, Timestamp, deleteDoc, doc, where } from 'firebase/firestore';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, ArrowLeft, Loader2, User, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

// Validation function to check for missing critical fields
const validateMemberData = (member: any) => {
    const criticalFields = [
        { key: 'contact_no', label: 'Contact Number' },
        { key: 'address', label: 'Address' },
        { key: 'province', label: 'Province' },
        { key: 'city_town', label: 'City/Town' },
        { key: 'barangay_village', label: 'Barangay' },
        { key: 'birth_date', label: 'Birth Date' },
        { key: 'sex', label: 'Sex' },
        { key: 'civil_status', label: 'Civil Status' },
    ];

    const missing = criticalFields.filter(field => !member[field.key] || member[field.key] === '');
    return missing;
};

const PresentMemberPage = () => {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedMember, setSelectedMember] = useState<any>(null);
    const [attendanceStatus, setAttendanceStatus] = useState<'PRESENT' | 'NONE'>('NONE');
    const [showWarningDialog, setShowWarningDialog] = useState(false);
    const [missingFields, setMissingFields] = useState<any[]>([]);
    const navigate = useNavigate();
    const [attendanceRefreshKey, setAttendanceRefreshKey] = useState(0);
    const { user } = useAuth();

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearch(search), 500);
        return () => clearTimeout(handler);
    }, [search]);

    const { data: allMembers, isLoading } = useQuery({
        queryKey: ['members'],
        queryFn: async () => {
            const q = query(collection(db, 'members'));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
        },
    });

    const results = useMemo(() => {
        if (!allMembers) return [];
        if (!debouncedSearch) return allMembers.slice(0, 20);

        const lowerSearch = debouncedSearch.toLowerCase();
        return allMembers.filter((m: any) =>
            (m.full_name?.toLowerCase().includes(lowerSearch) ||
                m.member_no?.toLowerCase().includes(lowerSearch))
        );
    }, [allMembers, debouncedSearch]);

    const mutation = useMutation({
        mutationFn: async (member: any) => {
            if (!user) throw new Error('Not authenticated');

            const now = new Date();
            const originBranchId = member.origin_branch_id;
            const visitedBranchId = user.branch_id;

            let status = 'PENDING';
            let approvedBy = null;
            let approvedAt = null;

            if ((visitedBranchId && originBranchId && String(visitedBranchId) === String(originBranchId)) || user.role === 'SUPER_ADMIN') {
                status = 'APPROVED';
                approvedBy = user.uid || user.id;
                approvedAt = Timestamp.fromDate(now);
            }

            const attendanceData = {
                member_id: member.id,
                member: {
                    full_name: member.full_name,
                    member_no: member.member_no,
                    origin_branch_id: member.origin_branch_id
                },
                origin_branch: member.origin_branch || { name: 'Unknown' },
                origin_branch_id: originBranchId,
                visited_branch_id: visitedBranchId || 'unknown',
                visited_branch: user.branch || { name: 'Unknown' },
                attendance_date_time: Timestamp.fromDate(now),
                status: status,
                created_by_user_id: user.uid || user.id,
                created_by_name: user.name || user.email,
                approved_by_user_id: approvedBy,
                approved_at: approvedAt,
                notes: '',
            };

            const docRef = await addDoc(collection(db, 'attendance'), attendanceData);
            return { id: docRef.id, ...attendanceData };
        },
        onSuccess: async (data) => {
            // Show success toast with undo button
            toast.success(data.status === 'APPROVED' ? 'Attendance Approved!' : 'Attendance Submitted for Approval', {
                duration: 10000,
                action: {
                    label: 'Undo',
                    onClick: () => undoMutation.mutate(data.id)
                }
            });

            // Audit Log
            try {
                await addDoc(collection(db, 'audit_logs'), {
                    action_type: 'CREATE_ATTENDANCE',
                    entity_type: 'Attendance',
                    entity_id: data.id,
                    actor_user_id: user?.uid || 'unknown',
                    actor_name: user?.email || 'unknown',
                    after: data,
                    created_at: Timestamp.now()
                });
            } catch (e) {
                console.error('Audit log failed', e);
            }

            setSelectedMember(null);
            setAttendanceRefreshKey((k) => k + 1);
        },
        onError: (err: any) => {
            console.error(err);
            toast.error('Failed to log attendance');
        },
    });

    const undoMutation = useMutation({
        mutationFn: async (attendanceId: string) => {
            await deleteDoc(doc(db, 'attendance', attendanceId));

            // Audit log for undo
            await addDoc(collection(db, 'audit_logs'), {
                action_type: 'DELETE_ATTENDANCE',
                entity_type: 'Attendance',
                entity_id: attendanceId,
                actor_user_id: user?.uid || 'unknown',
                actor_name: user?.email || 'unknown',
                created_at: Timestamp.now()
            });

            return attendanceId;
        },
        onSuccess: () => {
            toast.success('Attendance log reverted successfully');
        },
        onError: () => {
            toast.error('Failed to undo attendance log');
        }
    });

    const handleLogAttendance = () => {
        if (!selectedMember) return;

        // Check for missing fields
        const missing = validateMemberData(selectedMember);

        if (missing.length > 0) {
            setMissingFields(missing);
            setShowWarningDialog(true);
        } else {
            mutation.mutate(selectedMember);
        }
    };

    const handleProceedAnyway = () => {
        setShowWarningDialog(false);
        mutation.mutate(selectedMember);
    };

    // Check if selected member has attendance today
    useEffect(() => {
        const fetchAttendanceStatus = async () => {
            if (!selectedMember) {
                setAttendanceStatus('NONE');
                return;
            }
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);

                // Single-field query to avoid composite index issues; filter client-side for today range
                const q = query(
                    collection(db, 'attendance'),
                    where('member_id', '==', selectedMember.id)
                );
                const snapshot = await getDocs(q);
                const hasToday = snapshot.docs.some((d) => {
                    const ts = (d.data() as any).attendance_date_time as Timestamp | undefined;
                    if (!ts) return false;
                    const date = ts.toDate();
                    return date >= today && date < tomorrow;
                });
                setAttendanceStatus(hasToday ? 'PRESENT' : 'NONE');
            } catch (err) {
                console.error('Failed to check attendance status', err);
                setAttendanceStatus('NONE');
            }
        };

        fetchAttendanceStatus();
    }, [selectedMember, attendanceRefreshKey]);

    return (
        <div className="min-h-screen bg-muted/30 pb-20 md:pb-8">
            <div className="container mx-auto max-w-6xl p-4 space-y-4">
                <div className="flex items-center gap-4">
                    <Link to="/">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <h1 className="text-2xl md:text-3xl font-bold font-heading">Log Attendance</h1>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                        placeholder="Search by name or member number..."
                        className="pl-10 h-12 text-base"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="grid gap-4 md:gap-6 md:grid-cols-2 items-start">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle className="text-lg">Search Results</CardTitle>
                        </CardHeader>
                        <CardContent className="min-h-[60vh] max-h-[70vh] overflow-y-auto pr-2">
                            {isLoading ? (
                                <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                            ) : results && results.length > 0 ? (
                                <div className="space-y-2">
                                    {results.map((m: any) => {
                                        const missing = validateMemberData(m);
                                        return (
                                            <div
                                                key={m.id}
                                                className={`p-3 md:p-4 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 active:bg-muted ${selectedMember?.id === m.id ? 'bg-primary/10 border-primary' : ''}`}
                                                onClick={() => setSelectedMember(m)}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                                        <User className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-semibold text-sm md:text-base truncate">{m.full_name}</div>
                                                        <div className="text-xs md:text-sm text-muted-foreground">{m.member_no}</div>
                                                        {missing.length > 0 && (
                                                            <div className="flex items-center gap-1 mt-1">
                                                                <AlertTriangle className="h-3 w-3 text-orange-500" />
                                                                <span className="text-xs text-orange-500">{missing.length} field(s) missing</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <Badge variant={m.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-xs">
                                                        {m.status || 'ACTIVE'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center p-8 text-sm md:text-base text-muted-foreground">
                                    {debouncedSearch ? 'No members found' : 'Showing first 20 members. Type to search the list.'}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle className="text-lg">Member Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 md:space-y-6">
                            {selectedMember ? (
                                <div className="space-y-4 md:space-y-6">
                                    <div className="flex flex-col items-center gap-3 md:gap-4 pb-4 md:pb-6 border-b">
                                        <div className="h-20 w-20 md:h-24 md:w-24 rounded-full bg-primary/10 flex items-center justify-center">
                                            <User className="h-10 w-10 md:h-12 md:w-12 text-primary" />
                                        </div>
                                        <div className="text-center">
                                            <h3 className="text-xl md:text-2xl font-bold">{selectedMember.full_name}</h3>
                                            <p className="text-sm md:text-base text-muted-foreground">{selectedMember.member_no}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 md:gap-4 text-sm">
                                        <div>
                                            <div className="text-muted-foreground mb-1 text-xs md:text-sm">Origin Branch</div>
                                            <div className="font-semibold text-xs md:text-sm">{selectedMember.origin_branch?.name || selectedMember.origin_branch_id || 'N/A'}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground mb-1 text-xs md:text-sm">Status</div>
                                            <Badge variant={selectedMember.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-xs">
                                                {selectedMember.status || 'ACTIVE'}
                                            </Badge>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground mb-1 text-xs md:text-sm">Contact</div>
                                            <div className="font-semibold text-xs md:text-sm">{selectedMember.contact_no || 'Not provided'}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground mb-1 text-xs md:text-sm">Classification</div>
                                            <div className="font-semibold text-xs md:text-sm">{selectedMember.classification || 'N/A'}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground mb-1 text-xs md:text-sm">Attendance Status</div>
                                            <Badge variant={attendanceStatus === 'PRESENT' ? 'default' : 'secondary'} className="text-xs">
                                                {attendanceStatus === 'PRESENT' ? 'PRESENT (today)' : 'Not logged today'}
                                            </Badge>
                                        </div>
                                    </div>

                                    {validateMemberData(selectedMember).length > 0 && (
                                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 md:p-4">
                                            <div className="flex items-start gap-2">
                                                <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <div className="font-semibold text-orange-900 text-sm md:text-base">Incomplete Profile</div>
                                                    <div className="text-xs md:text-sm text-orange-700">Some fields are missing. Please update member data.</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="hidden md:block pt-2">
                                        <Button
                                            className="w-full h-14 text-lg bg-[#2c2a9c] hover:bg-[#241f7a] text-white"
                                            onClick={handleLogAttendance}
                                            disabled={mutation.isPending}
                                        >
                                            {mutation.isPending ? (
                                                <>
                                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                                    Processing...
                                                </>
                                            ) : (
                                                'Log Attendance'
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
                                    <User className="h-12 w-12 md:h-16 md:w-16 opacity-20" />
                                    <p className="text-sm md:text-base">Select a member from the search results</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Fixed Bottom Button */}
            {selectedMember && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t shadow-lg md:hidden">
                    <Button
                        className="w-full h-14 text-lg bg-[#2c2a9c] hover:bg-[#241f7a] text-white"
                        onClick={handleLogAttendance}
                        disabled={mutation.isPending}
                    >
                        {mutation.isPending ? (
                            <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            'Log Attendance'
                        )}
                    </Button>
                </div>
            )}

            {/* Desktop Button (hidden on mobile) */}
            {/* Missing Fields Warning Dialog */}
            <Dialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-orange-500" />
                            Incomplete Member Profile
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            The following required fields are missing for this member:
                        </p>
                        <div className="bg-muted p-4 rounded-lg max-h-48 overflow-y-auto">
                            <ul className="space-y-1">
                                {missingFields.map((field) => (
                                    <li key={field.key} className="text-sm flex items-center gap-2">
                                        <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                                        {field.label}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Would you like to proceed anyway, or update the member's profile first?
                        </p>
                    </div>
                    <DialogFooter className="gap-2 flex-col sm:flex-row">
                        <Button variant="outline" onClick={() => setShowWarningDialog(false)} className="w-full sm:w-auto">
                            Cancel
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setShowWarningDialog(false);
                                navigate(`/members?edit=${selectedMember?.id || ''}`, { replace: false });
                            }}
                            className="w-full sm:w-auto"
                        >
                            Update Profile
                        </Button>
                        <Button onClick={handleProceedAnyway} className="w-full sm:w-auto">
                            Proceed Anyway
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default PresentMemberPage;
