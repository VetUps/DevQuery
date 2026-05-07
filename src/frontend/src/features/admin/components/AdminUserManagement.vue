<script setup lang="ts">
import { onMounted } from 'vue'

import AdminUserReputationDetail from '@/features/admin/components/AdminUserReputationDetail.vue'
import AdminUserSearchPanel from '@/features/admin/components/AdminUserSearchPanel.vue'
import { useAdminUserManagement } from '@/features/admin/composables/useAdminUserManagement'
import SurfacePanel from '@/shared/ui/SurfacePanel.vue'

const adminUsers = useAdminUserManagement()

onMounted(() => {
  void adminUsers.loadUsers()
})
</script>

<template>
  <div class="admin-user-management" data-testid="admin-user-management">
    <SurfacePanel padding="lg">
      <AdminUserSearchPanel
        v-model:search-text="adminUsers.searchText.value"
        :users="adminUsers.users.value"
        :selected-user-id="adminUsers.selectedUserId.value"
        :is-loading="adminUsers.isListLoading.value"
        :error="adminUsers.listError.value"
        @submit="adminUsers.loadUsers"
        @retry="adminUsers.loadUsers"
        @select-user="adminUsers.selectUser"
      />
    </SurfacePanel>

    <SurfacePanel padding="lg">
      <AdminUserReputationDetail
        :selected-user="adminUsers.selectedUser.value"
        :detail="adminUsers.selectedUserDetail.value"
        :is-loading="adminUsers.isDetailLoading.value"
        :error="adminUsers.detailError.value"
        :is-override-saving="adminUsers.isOverrideSaving.value"
        :override-error="adminUsers.overrideError.value"
        :override-success="adminUsers.overrideSuccess.value"
        @retry="adminUsers.retrySelectedUser"
        @submit-manual-override="adminUsers.submitManualOverride"
      />
    </SurfacePanel>
  </div>
</template>

<style scoped>
.admin-user-management {
  display: grid;
  grid-template-columns: minmax(300px, 0.95fr) minmax(360px, 1.35fr);
  gap: var(--space-lg);
  align-items: start;
}

@media (width <= 1040px) {
  .admin-user-management {
    grid-template-columns: 1fr;
  }
}
</style>
